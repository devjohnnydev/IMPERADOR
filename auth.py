# -*- coding: utf-8 -*-
"""
Usuários, perfis e permissões do painel do Imperador Lounge Bar.

- Senhas com PBKDF2-SHA256 + salt (nunca em texto puro) em data/admin_auth.json
- Cada usuário tem um perfil (Administrador, Gerente, Conferente...) e uma
  permissão por módulo: none (sem acesso) < view (ver) < use (usar) < edit (editar)
- Sessões por token com expiração e bloqueio após tentativas erradas
"""

import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent
AUTH_FILE = BASE_DIR / "data" / "admin_auth.json"

USUARIO_PADRAO = "admin"
SENHA_PADRAO = "imperador123"

SESSAO_SEGUNDOS = 12 * 60 * 60
MAX_TENTATIVAS = 5
JANELA_TENTATIVAS = 10 * 60
BLOQUEIO_SEGUNDOS = 5 * 60
ITERACOES = 200_000

NIVEIS = {"none": 0, "view": 1, "use": 2, "edit": 3}

# Módulos do sistema (a mesma lista existe no admin.js)
MODULOS = [
    "dashboard", "recebimento", "aprovacoes", "estoque", "produtos", "vendas",
    "comissoes", "financeiro", "site", "redes", "mesas", "config", "usuarios", "tv",
]


def _perm(**niveis) -> Dict[str, str]:
    return {m: niveis.get(m, "none") for m in MODULOS}


PERFIS = {
    "admin": {"label": "Administrador", "permissions": {m: "edit" for m in MODULOS}},
    "gerente": {"label": "Gerente", "permissions": _perm(
        dashboard="view", recebimento="edit", aprovacoes="use", estoque="edit", produtos="edit",
        vendas="edit", comissoes="view", financeiro="edit", site="edit", redes="edit", mesas="edit",
        config="view", usuarios="view", tv="edit")},
    "conferente": {"label": "Conferente (recebimento)", "permissions": _perm(
        dashboard="view", recebimento="use", estoque="view")},
    "estoquista": {"label": "Estoquista / Bar", "permissions": _perm(
        dashboard="view", recebimento="view", estoque="use", produtos="view", vendas="use")},
    "vendedor": {"label": "Vendedor / Garçom", "permissions": _perm(
        dashboard="view", vendas="use", mesas="view")},
    "financeiro": {"label": "Financeiro", "permissions": _perm(
        dashboard="view", recebimento="view", aprovacoes="use", estoque="view", produtos="view",
        vendas="view", comissoes="view", financeiro="edit")},
    "tv": {"label": "TV / Monitor", "permissions": _perm(tv="view")},
}

_lock = threading.Lock()
_tokens: Dict[str, Dict] = {}
_falhas: Dict[str, list] = {}
_bloqueios: Dict[str, float] = {}


# ---------------------------------------------------------------------------
# Armazenamento
# ---------------------------------------------------------------------------
def _hash(senha: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(salt), ITERACOES).hex()


def _definir_senha(reg: Dict, senha: str, trocar: bool) -> None:
    reg["salt"] = secrets.token_hex(16)
    reg["hash"] = _hash(senha, reg["salt"])
    reg["mustChange"] = trocar


def _usuario_padrao() -> Dict:
    reg = {
        "id": "u-admin",
        "username": USUARIO_PADRAO,
        "name": "Administrador",
        "role": "admin",
        "permissions": dict(PERFIS["admin"]["permissions"]),
        "commissionPercent": 0,
        "active": True,
        "createdAt": time.strftime("%Y-%m-%d %H:%M"),
    }
    _definir_senha(reg, SENHA_PADRAO, True)
    return reg


def _salvar(dados: Dict) -> None:
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = AUTH_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(AUTH_FILE)


def _carregar() -> Dict:
    if not AUTH_FILE.exists():
        dados = {"users": [_usuario_padrao()]}
        _salvar(dados)
        return dados
    dados = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    alterou = False
    for i, u in enumerate(dados.get("users", [])):
        # Migração da versão de usuário único
        if "id" not in u:
            u["id"] = "u-admin" if i == 0 else f"u-{secrets.token_hex(4)}"
            alterou = True
        if "role" not in u:
            u["role"] = "admin"
            alterou = True
        u.setdefault("name", u["username"])
        u.setdefault("active", True)
        u.setdefault("commissionPercent", 0)
        if "permissions" not in u:
            u["permissions"] = dict(_perfis(dados).get(u["role"], PERFIS["vendedor"])["permissions"])
            alterou = True
        for m in MODULOS:
            u["permissions"].setdefault(m, "edit" if u["role"] == "admin" else "none")
    if alterou:
        _salvar(dados)
    return dados


def _perfis(dados: Dict) -> Dict[str, Dict]:
    """Perfis padrão + perfis criados/alterados no IAM (o Administrador não muda)."""
    perfis = {k: {"label": v["label"], "permissions": dict(v["permissions"]), "builtin": True} for k, v in PERFIS.items()}
    for k, v in (dados.get("roles") or {}).items():
        if k == "admin":
            continue
        base = perfis.get(k, {"builtin": False})
        perms = {m: (v.get("permissions", {}).get(m) if v.get("permissions", {}).get(m) in NIVEIS else "none") for m in MODULOS}
        perfis[k] = {"label": v.get("label") or base.get("label") or k, "permissions": perms, "builtin": base.get("builtin", False)}
    return perfis


def _buscar(dados: Dict, usuario: str) -> Optional[Dict]:
    usuario = (usuario or "").strip().lower()
    return next((u for u in dados.get("users", []) if u["username"].lower() == usuario), None)


def _buscar_id(dados: Dict, uid: str) -> Optional[Dict]:
    return next((u for u in dados.get("users", []) if u["id"] == uid), None)


def publico(reg: Dict, perfis: Optional[Dict] = None) -> Dict:
    """Dados do usuário que podem ir para o navegador (sem hash/salt)."""
    perfis = perfis or PERFIS
    return {
        "id": reg["id"],
        "username": reg["username"],
        "name": reg.get("name") or reg["username"],
        "role": reg.get("role", "vendedor"),
        "roleLabel": perfis.get(reg.get("role"), {}).get("label", reg.get("role")),
        "permissions": dict(reg.get("permissions", {})),
        "commissionPercent": float(reg.get("commissionPercent") or 0),
        "active": bool(reg.get("active", True)),
        "isAdmin": reg.get("role") == "admin",
        "mustChange": bool(reg.get("mustChange")),
        "createdAt": reg.get("createdAt", ""),
    }


def inicializar_auth() -> None:
    with _lock:
        _carregar()


def nivel(user: Optional[Dict], modulo: str) -> int:
    if not user:
        return 0
    if user.get("isAdmin"):
        return 3
    return NIVEIS.get((user.get("permissions") or {}).get(modulo, "none"), 0)


def pode(user: Optional[Dict], modulo: str, minimo: str = "view") -> bool:
    return nivel(user, modulo) >= NIVEIS[minimo]


# ---------------------------------------------------------------------------
# Login / sessão
# ---------------------------------------------------------------------------
def esta_bloqueado(ip: str) -> int:
    restante = int(_bloqueios.get(ip, 0) - time.time())
    return restante if restante > 0 else 0


def _registrar_falha(ip: str) -> None:
    agora = time.time()
    lista = [t for t in _falhas.get(ip, []) if agora - t < JANELA_TENTATIVAS]
    lista.append(agora)
    _falhas[ip] = lista
    if len(lista) >= MAX_TENTATIVAS:
        _bloqueios[ip] = agora + BLOQUEIO_SEGUNDOS
        _falhas[ip] = []


def login(usuario: str, senha: str, ip: str) -> Tuple[bool, Dict]:
    with _lock:
        espera = esta_bloqueado(ip)
        if espera:
            return False, {"error": f"Muitas tentativas. Tente novamente em {max(1, espera // 60)} min.", "locked": True}
        dados = _carregar()
        reg = _buscar(dados, usuario)
        ok = bool(reg) and reg.get("active", True) and hmac.compare_digest(_hash(senha or "", reg["salt"]), reg["hash"])
        if not reg:
            _hash(senha or "", "00" * 16)  # mesmo custo de tempo quando o usuário não existe
        if not ok:
            _registrar_falha(ip)
            return False, {"error": "Usuário ou senha incorretos."}
        _falhas.pop(ip, None)
        token = secrets.token_urlsafe(32)
        exp = time.time() + SESSAO_SEGUNDOS
        _tokens[token] = {"userId": reg["id"], "exp": exp, "ip": ip, "createdAt": time.time(), "lastSeen": time.time(), "device": ""}
        return True, {"token": token, "expiresAt": int(exp * 1000), "user": publico(reg, _perfis(dados))}


def usuario_do_token(token: str) -> Optional[Dict]:
    """Retorna o usuário (público, com permissões atuais) dono do token, ou None."""
    if not token:
        return None
    with _lock:
        sessao = _tokens.get(token)
        if not sessao:
            return None
        if sessao["exp"] < time.time():
            _tokens.pop(token, None)
            return None
        dados = _carregar()
        reg = _buscar_id(dados, sessao["userId"])
        if not reg or not reg.get("active", True):
            _tokens.pop(token, None)
            return None
        sessao["lastSeen"] = time.time()
        return publico(reg, _perfis(dados))


def logout(token: str) -> None:
    with _lock:
        _tokens.pop(token, None)


def _encerrar_sessoes(uid: str, exceto: str = "") -> None:
    for tk, s in list(_tokens.items()):
        if s["userId"] == uid and tk != exceto:
            _tokens.pop(tk, None)


def precisa_trocar_senha_padrao() -> bool:
    with _lock:
        reg = _buscar(_carregar(), USUARIO_PADRAO)
        return bool(reg and reg.get("mustChange"))


# ---------------------------------------------------------------------------
# Senha e cadastro de usuários
# ---------------------------------------------------------------------------
def _validar_senha(senha: str) -> Optional[str]:
    if len(senha or "") < 8:
        return "A senha precisa ter pelo menos 8 caracteres."
    if senha == SENHA_PADRAO:
        return "Escolha uma senha diferente da senha padrão."
    return None


def _validar_login(nome: str) -> Optional[str]:
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,32}", nome or ""):
        return "O usuário deve ter de 3 a 32 caracteres (letras, números, ponto, _ ou -)."
    return None


def trocar_senha(uid: str, senha_atual: str, nova_senha: str, token_atual: str = "") -> Tuple[bool, str]:
    erro = _validar_senha(nova_senha)
    if erro:
        return False, erro
    with _lock:
        dados = _carregar()
        reg = _buscar_id(dados, uid)
        if not reg or not hmac.compare_digest(_hash(senha_atual or "", reg["salt"]), reg["hash"]):
            return False, "Senha atual incorreta."
        _definir_senha(reg, nova_senha, False)
        _salvar(dados)
        _encerrar_sessoes(uid, exceto=token_atual)
        return True, "Senha alterada."


def listar_usuarios() -> List[Dict]:
    with _lock:
        dados = _carregar()
        perfis = _perfis(dados)
        online = {}
        agora = time.time()
        for s in _tokens.values():
            if s["exp"] > agora:
                online[s["userId"]] = max(online.get(s["userId"], 0), s.get("lastSeen", 0))
        lista = []
        for u in dados.get("users", []):
            pu = publico(u, perfis)
            pu["lastSeen"] = int(online[u["id"]] * 1000) if u["id"] in online else None
            lista.append(pu)
        return lista


def perfis_publicos() -> Dict:
    with _lock:
        dados = _carregar()
        perfis = _perfis(dados)
        for k, v in perfis.items():
            v["users"] = sum(1 for u in dados.get("users", []) if u.get("role") == k)
        return perfis


def salvar_perfil(dados_in: Dict, quem: Dict) -> Tuple[bool, str]:
    """Cria ou altera um perfil (modelo de permissões) no IAM."""
    chave = re.sub(r"[^a-z0-9_]", "", (dados_in.get("key") or "").strip().lower().replace(" ", "_"))[:30]
    rotulo = (dados_in.get("label") or "").strip()[:50]
    if not rotulo:
        return False, "Informe o nome do perfil."
    with _lock:
        dados = _carregar()
        perfis = _perfis(dados)
        if not chave:
            base = re.sub(r"[^a-z0-9]+", "_", rotulo.lower()).strip("_")[:24] or "perfil"
            chave = base
            n = 2
            while chave in perfis:
                chave = f"{base}_{n}"
                n += 1
        if chave == "admin":
            return False, "O perfil Administrador não pode ser alterado."
        perms_in = dados_in.get("permissions") or {}
        perms = {m: (perms_in.get(m) if perms_in.get(m) in NIVEIS else "none") for m in MODULOS}
        dados.setdefault("roles", {})[chave] = {"label": rotulo, "permissions": perms}
        aplicados = 0
        if dados_in.get("applyToUsers"):
            for u in dados.get("users", []):
                if u.get("role") == chave:
                    u["permissions"] = dict(perms)
                    aplicados += 1
        _salvar(dados)
        return True, f"Perfil salvo{f' e aplicado a {aplicados} usuário(s)' if aplicados else ''}."


def excluir_perfil(chave: str) -> Tuple[bool, str]:
    with _lock:
        dados = _carregar()
        if chave in PERFIS:
            return False, "Perfis padrão não podem ser excluídos (você pode alterar as permissões)."
        if any(u.get("role") == chave for u in dados.get("users", [])):
            return False, "Há usuários com este perfil. Troque o perfil deles antes de excluir."
        (dados.get("roles") or {}).pop(chave, None)
        _salvar(dados)
        return True, "Perfil excluído."


def marcar_dispositivo(token: str, device_id: str) -> None:
    with _lock:
        if token in _tokens:
            _tokens[token]["device"] = device_id


def sessoes_ativas() -> List[Dict]:
    with _lock:
        nomes = {u["id"]: (u.get("name") or u["username"]) for u in _carregar().get("users", [])}
        agora = time.time()
        return sorted([
            {"userId": s["userId"], "userName": nomes.get(s["userId"], "?"), "ip": s.get("ip", ""),
             "device": s.get("device", ""), "since": int(s.get("createdAt", 0) * 1000), "lastSeen": int(s.get("lastSeen", 0) * 1000)}
            for s in _tokens.values() if s["exp"] > agora
        ], key=lambda x: -x["lastSeen"])


def encerrar_sessoes_de(uid: str, quem: Dict) -> Tuple[bool, str]:
    if uid == quem.get("id"):
        return False, "Para encerrar a sua própria sessão, use o botão Sair."
    with _lock:
        _encerrar_sessoes(uid)
    return True, "Sessões encerradas."


def salvar_usuario(dados_in: Dict, quem: Dict) -> Tuple[bool, str]:
    """Cria ou edita um usuário (requer permissão de editar 'usuarios')."""
    with _lock:
        dados = _carregar()
        uid = (dados_in.get("id") or "").strip()
        username = (dados_in.get("username") or "").strip()
        erro = _validar_login(username)
        if erro:
            return False, erro
        perfis = _perfis(dados)
        role = dados_in.get("role") if dados_in.get("role") in perfis else "vendedor"
        if role == "admin" and not quem.get("isAdmin"):
            return False, "Somente um administrador pode criar outro administrador."

        existente = _buscar(dados, username)
        reg = _buscar_id(dados, uid) if uid else None
        if existente and (not reg or existente["id"] != reg["id"]):
            return False, "Esse nome de usuário já está em uso."
        if reg and reg.get("role") == "admin" and not quem.get("isAdmin"):
            return False, "Somente um administrador pode alterar outro administrador."

        perms_in = dados_in.get("permissions") or {}
        perms = {m: (perms_in.get(m) if perms_in.get(m) in NIVEIS else perfis[role]["permissions"][m]) for m in MODULOS}
        if role == "admin":
            perms = {m: "edit" for m in MODULOS}

        try:
            comissao = max(0.0, min(100.0, float(dados_in.get("commissionPercent") or 0)))
        except (TypeError, ValueError):
            comissao = 0.0

        senha = dados_in.get("password") or ""
        if not reg:
            erro = _validar_senha(senha)
            if erro:
                return False, erro
            reg = {"id": f"u-{secrets.token_hex(5)}", "createdAt": time.strftime("%Y-%m-%d %H:%M")}
            dados["users"].append(reg)
            _definir_senha(reg, senha, True)
        elif senha:
            erro = _validar_senha(senha)
            if erro:
                return False, erro
            _definir_senha(reg, senha, True)
            _encerrar_sessoes(reg["id"])

        ativo = bool(dados_in.get("active", True))
        if reg["id"] == quem.get("id") and not ativo:
            return False, "Você não pode desativar o seu próprio usuário."
        # Garante que sempre exista ao menos um administrador ativo
        if reg.get("role") == "admin" and (role != "admin" or not ativo):
            outros = [u for u in dados["users"] if u is not reg and u.get("role") == "admin" and u.get("active", True)]
            if not outros:
                return False, "O sistema precisa de pelo menos um administrador ativo."

        reg.update({
            "username": username,
            "name": (dados_in.get("name") or username).strip()[:60],
            "role": role,
            "permissions": perms,
            "commissionPercent": comissao,
            "active": ativo,
        })
        if not ativo:
            _encerrar_sessoes(reg["id"])
        _salvar(dados)
        return True, reg["id"]


def excluir_usuario(uid: str, quem: Dict) -> Tuple[bool, str]:
    with _lock:
        dados = _carregar()
        reg = _buscar_id(dados, uid)
        if not reg:
            return False, "Usuário não encontrado."
        if reg["id"] == quem.get("id"):
            return False, "Você não pode excluir o seu próprio usuário."
        if reg.get("role") == "admin":
            if not quem.get("isAdmin"):
                return False, "Somente um administrador pode excluir outro administrador."
            outros = [u for u in dados["users"] if u is not reg and u.get("role") == "admin" and u.get("active", True)]
            if not outros:
                return False, "O sistema precisa de pelo menos um administrador ativo."
        dados["users"] = [u for u in dados["users"] if u is not reg]
        _encerrar_sessoes(uid)
        _salvar(dados)
        return True, "Usuário excluído."


def nomes_usuarios() -> Dict[str, str]:
    with _lock:
        return {u["id"]: (u.get("name") or u["username"]) for u in _carregar().get("users", [])}

# -*- coding: utf-8 -*-
"""
===============================================================================
IMPERADOR LOUNGE BAR - SERVIDOR PRINCIPAL EM PYTHON (SQLite3 + PIX BRCode)
===============================================================================
1. Site / Home e Cardápio Digital (público)
2. Tablet na Mesa com PIX QR Code (público)
3. Painel administrativo com usuários, perfis e permissões por módulo:
   Recebimento -> Aprovação -> Estoque (depósito / bar / uso) -> Vendas,
   Produtos & Preços (ficha técnica e margem), Comissões, Financeiro, Site...

Como executar:
    python app.py
"""

import os
import time

# Horário de Brasília em qualquer servidor (o Railway roda em UTC)
os.environ.setdefault("TZ", "America/Sao_Paulo")
if hasattr(time, "tzset"):
    time.tzset()

import base64
import json
import socket
import mimetypes
import os
import re
import sys
import threading
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import auth
import erp
import storage
from database import (
    calcular_resumo_financeiro_dre,
    inicializar_banco,
    ler_estado_completo,
    obter_dados_iniciais_imperador,
    salvar_estado_completo,
)
from instagram_publisher import (
    gerar_legenda_instagram,
    publicar_no_facebook_pagina,
    publicar_no_instagram_graph_api,
)
from pix_qrcode import gerar_payload_pix_brcode

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
UPLOADS_DIR = PUBLIC_DIR / "uploads"
PORT = int(os.environ.get("PORT", 8000))
MAX_CORPO = 20 * 1024 * 1024

# Uma gravação por vez no estado (evita que duas ações simultâneas se sobrescrevam)
_estado_lock = threading.Lock()

# Limite simples de requisições públicas (chat / tablets) por IP
_limites: dict = {}


def _limite_ok(ip: str, chave: str, maximo: int, janela: float = 60.0) -> bool:
    agora = time.time()
    lista = [t for t in _limites.get((ip, chave), []) if agora - t < janela]
    if len(lista) >= maximo:
        _limites[(ip, chave)] = lista
        return False
    lista.append(agora)
    _limites[(ip, chave)] = lista
    return True


def _url_absoluta(url: str, estado: dict) -> str:
    """Converte /uploads/foto.jpg em https://seusite.com/uploads/foto.jpg (exigido pelas redes sociais)."""
    url = (url or "").strip()
    if not url or url.startswith(("http://", "https://", "data:")):
        return url
    base = ((estado.get("home") or {}).get("publicSiteUrl") or "").strip().rstrip("/")
    if not base:
        return url
    return base + (url if url.startswith("/") else "/" + url)


def carregar_estado() -> dict:
    estado = ler_estado_completo()
    if erp.garantir_erp(estado):
        salvar_estado_completo(estado)
    return estado


def estado_publico(estado: dict) -> dict:
    """O que qualquer visitante (cardápio, tablet, site) pode receber."""
    cfg = dict(estado.get("settings", {}) or {})
    cfg.pop("adminPin", None)
    ig = dict(cfg.get("instagramConfig", {}) or {})
    for chave in ("accessToken", "igUserId", "webhookUrl"):
        ig.pop(chave, None)
    cfg["instagramConfig"] = ig
    cfg.pop("commission", None)
    home = dict(estado.get("home", {}) or {})
    home.pop("facebookConfig", None)
    ocultos = ("costPrice", "minStock", "composition", "targetMarkup", "extraCost")
    copia = {"menuItems": [dict(i) for i in (estado.get("menuItems") or [])], "erp": estado.get("erp")}
    erp.marcar_esgotados(copia)
    itens = [{k: v for k, v in i.items() if k not in ocultos} for i in copia["menuItems"] if i.get("available") is not False]
    pedidos = []
    for o in estado.get("orders", []) or []:
        if o.get("paymentStatus") == "pago" or o.get("orderStatus") == "cancelado":
            continue
        limpo = {k: v for k, v in o.items() if k not in ("costTotal", "stockUsage", "sellerId")}
        limpo["items"] = [{k: v for k, v in ln.items() if k != "costPrice"} for ln in o.get("items", [])]
        pedidos.append(limpo)
    return {
        "settings": cfg, "home": home,
        "categories": estado.get("categories", []), "menuItems": itens,
        "tables": estado.get("tables", []), "socialPosts": estado.get("socialPosts", []),
        "orders": pedidos, "waiterCalls": [], "purchases": [], "employees": [], "fixedExpenses": [],
        "historicalRevenueAdjustment": {}, "erp": {"products": [], "receipts": [], "movements": []},
    }


def resposta_estado(estado: dict, user) -> dict:
    if not user:
        return {"ok": True, "authenticated": False, "engine": "Python 3 + SQLite3", "state": estado_publico(estado)}
    dados = {"ok": True, "authenticated": True, "user": user, "engine": "Python 3 + SQLite3",
             "state": erp.estado_para_usuario(estado, user)}
    if auth.pode(user, "financeiro"):
        dados["drePython"] = calcular_resumo_financeiro_dre(estado)
    if auth.pode(user, "usuarios") or auth.pode(user, "comissoes") or auth.pode(user, "vendas", "edit"):
        dados["users"] = auth.listar_usuarios()
        dados["roles"] = auth.perfis_publicos()
    if auth.pode(user, "tv", "use"):
        nomes = {u["name"] for u in auth.listar_usuarios() if u.get("active")}
        nomes |= {e.get("name") for e in estado.get("employees", []) if e.get("name") and e.get("status") != "inativo"}
        dados["staffNames"] = sorted(n for n in nomes if n)
    if auth.pode(user, "usuarios"):
        dados["sessions"] = auth.sessoes_ativas()
        dados["devicesOnline"] = erp.presenca_dispositivos()
    return dados


class ImperadorPythonHandler(BaseHTTPRequestHandler):
    """API REST + arquivos estáticos."""

    # ----------------------------------------------------------------- utilidades
    def _responder_json(self, status_code: int, dados: dict) -> None:
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self._headers_seguranca()
        self.end_headers()
        self.wfile.write(corpo)

    def _headers_seguranca(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")

    def _token(self) -> str:
        cab = self.headers.get("Authorization", "")
        return cab[7:].strip() if cab.startswith("Bearer ") else ""

    def _usuario(self):
        return auth.usuario_do_token(self._token())

    def _ip(self) -> str:
        if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("TRUST_PROXY"):
            encaminhado = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            if encaminhado:
                return encaminhado
        ip = self.client_address[0] if self.client_address else "?"
        return ip[7:] if ip.startswith("::ffff:") else ip

    def _negar(self, user) -> None:
        if not user:
            self._responder_json(401, {"ok": False, "error": "Sua sessão expirou. Entre novamente."})
        else:
            self._responder_json(403, {"ok": False, "error": "Seu perfil não tem permissão para isso."})

    # ----------------------------------------------------------------------- GET
    def do_GET(self) -> None:
        url = urlparse(self.path)
        rota = url.path
        query = parse_qs(url.query)

        if rota == "/api/state":
            self._responder_json(200, resposta_estado(carregar_estado(), self._usuario()))
            return

        if rota == "/api/health":
            self._responder_json(200, {"ok": True, "storage": storage.descricao(), "time": datetime.now().isoformat()})
            return

        # Imagens enviadas pelo painel (no Railway ficam no banco, pois o disco é apagado a cada deploy)
        if rota.startswith("/uploads/"):
            nome = rota[len("/uploads/"):]
            if re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", nome or ""):
                midia = storage.store().media_ler(nome)
                if midia:
                    conteudo, mime = midia
                    self.send_response(200)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", str(len(conteudo)))
                    self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                    self._headers_seguranca()
                    self.end_headers()
                    self.wfile.write(conteudo)
                    return

        if rota == "/api/me":
            user = self._usuario()
            if not user:
                self._negar(None)
                return
            self._responder_json(200, {"ok": True, "user": user})
            return

        if rota == "/api/dre":
            user = self._usuario()
            if not auth.pode(user, "financeiro"):
                self._negar(user)
                return
            self._responder_json(200, {"ok": True, "dre": calcular_resumo_financeiro_dre(carregar_estado())})
            return

        if rota == "/api/pix":
            cfg = carregar_estado().get("settings", {})
            try:
                valor = float(query.get("valor", ["0"])[0])
            except ValueError:
                valor = 0.0
            mesa = query.get("mesa", ["MESA01"])[0]
            brcode = gerar_payload_pix_brcode(
                chave_pix=cfg.get("pixKey", ""), nome_recebedor=cfg.get("pixMerchantName", "IMPERADOR LOUNGE BAR"),
                cidade_recebedor=cfg.get("pixMerchantCity", "SAO PAULO"), valor=valor, txid=f"IMP{mesa}",
            )
            self._responder_json(200, {"ok": True, "brcode": brcode, "valor": round(valor, 2),
                                       "chavePix": cfg.get("pixKey"), "recebedor": cfg.get("pixMerchantName")})
            return

        # Arquivos estáticos de public/
        relativo = "/index.html" if rota in ("/", "") else rota
        alvo = (PUBLIC_DIR / os.path.normpath(relativo.lstrip("/\\"))).resolve()
        try:
            alvo.relative_to(PUBLIC_DIR.resolve())
            dentro = True
        except ValueError:
            dentro = False
        if not dentro or not alvo.is_file() or alvo.name.startswith("_"):
            alvo = PUBLIC_DIR / "index.html"
        if not alvo.is_file():
            self.send_error(404, "Arquivo nao encontrado")
            return
        tipo, _ = mimetypes.guess_type(str(alvo))
        tipo = tipo or "application/octet-stream"
        if tipo.startswith(("text/", "application/javascript", "application/json")):
            tipo += "; charset=utf-8"
        conteudo = alvo.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(conteudo)))
        if alvo.suffix in (".js", ".css", ".html"):
            self.send_header("Cache-Control", "no-cache")
        self._headers_seguranca()
        self.end_headers()
        self.wfile.write(conteudo)

    # ---------------------------------------------------------------------- POST
    def do_POST(self) -> None:
        rota = urlparse(self.path).path
        tamanho = int(self.headers.get("Content-Length", 0) or 0)
        if tamanho > MAX_CORPO:
            self._responder_json(413, {"ok": False, "error": "Envio muito grande."})
            return
        bruto = self.rfile.read(tamanho).decode("utf-8") if tamanho > 0 else "{}"
        try:
            payload = json.loads(bruto) if bruto else {}
        except Exception as exc:
            self._responder_json(400, {"ok": False, "error": f"JSON inválido: {exc}"})
            return
        if not isinstance(payload, dict):
            payload = {}

        # ---- Sessão --------------------------------------------------------
        if rota == "/api/login":
            ok, dados = auth.login(payload.get("username", ""), payload.get("password", ""), self._ip())
            self._responder_json(200 if ok else (429 if dados.get("locked") else 401), {"ok": ok, **dados})
            return

        if rota == "/api/logout":
            auth.logout(self._token())
            self._responder_json(200, {"ok": True})
            return

        user = self._usuario()

        # ---- Chat de pedidos do cliente (sem login) --------------------------
        if rota in ("/api/chat/start", "/api/chat/send", "/api/chat/confirm", "/api/chat/poll"):
            if not _limite_ok(self._ip(), "chat", 90):
                self._responder_json(429, {"ok": False, "error": "Muitas mensagens. Aguarde um instante."})
                return
            funcoes = {"/api/chat/start": erp.chat_iniciar, "/api/chat/send": erp.chat_enviar,
                       "/api/chat/confirm": erp.chat_confirmar, "/api/chat/poll": erp.chat_buscar}
            with _estado_lock:
                estado = carregar_estado()
                try:
                    resultado = funcoes[rota](estado, payload)
                except erp.ErroNegocio as exc:
                    self._responder_json(400, {"ok": False, "error": str(exc)})
                    return
                if rota != "/api/chat/poll":
                    salvar_estado_completo(estado)
            self._responder_json(200, {"ok": True, **resultado})
            return

        # ---- Tablets: cadastro e sinal de presença ---------------------------
        if rota == "/api/device/register":
            if not _limite_ok(self._ip(), "device", 10):
                self._responder_json(429, {"ok": False, "error": "Aguarde um instante."})
                return
            with _estado_lock:
                estado = carregar_estado()
                try:
                    resultado = erp.dispositivo_registrar(estado, payload, self._ip())
                except erp.ErroNegocio as exc:
                    self._responder_json(400, {"ok": False, "error": str(exc)})
                    return
                salvar_estado_completo(estado)
            self._responder_json(200, {"ok": True, **resultado})
            return

        if rota == "/api/device/ping":
            if user:
                auth.marcar_dispositivo(self._token(), str(payload.get("deviceId", ""))[:40])
            self._responder_json(200, erp.dispositivo_ping(carregar_estado(), payload, user, self._ip()))
            return

        # ---- Pedidos e chamados do cardápio QR / tablet (sem login) ---------
        if rota == "/api/public/sync":
            if not _limite_ok(self._ip(), "sync", 30):
                self._responder_json(429, {"ok": False, "error": "Muitos pedidos em sequência. Aguarde um instante."})
                return
            with _estado_lock:
                estado = carregar_estado()
                qtd = erp.aplicar_sync_publico(estado, payload, user)
                if qtd:
                    salvar_estado_completo(estado)
            self._responder_json(200, {"ok": True, "added": qtd})
            return

        # Daqui para baixo é preciso estar logado
        if not user:
            self._negar(None)
            return

        if rota == "/api/change-password":
            ok, msg = auth.trocar_senha(user["id"], payload.get("currentPassword", ""),
                                        payload.get("newPassword", ""), self._token())
            self._responder_json(200 if ok else 400, {"ok": ok, "message" if ok else "error": msg,
                                                     "user": auth.usuario_do_token(self._token())})
            return

        # ---- Ações do ERP (estoque, notas, vendas, financeiro...) -------------
        if rota.startswith("/api/erp/"):
            nome = rota[len("/api/erp/"):]
            with _estado_lock:
                estado = carregar_estado()
                try:
                    mensagem = erp.executar(estado, nome, payload, user)
                except PermissionError as exc:
                    self._responder_json(403, {"ok": False, "error": str(exc)})
                    return
                except erp.ErroNegocio as exc:
                    self._responder_json(400, {"ok": False, "error": str(exc)})
                    return
                salvar_estado_completo(estado)
            self._responder_json(200, {"message": mensagem, **resposta_estado(estado, user)})
            return

        # ---- IAM: perfis e sessões --------------------------------------------
        if rota in ("/api/roles/save", "/api/roles/delete", "/api/sessions/end"):
            if not auth.pode(user, "usuarios", "edit"):
                self._negar(user)
                return
            if rota == "/api/roles/save":
                ok, msg = auth.salvar_perfil(payload, user)
            elif rota == "/api/roles/delete":
                ok, msg = auth.excluir_perfil(str(payload.get("key", "")))
            else:
                ok, msg = auth.encerrar_sessoes_de(str(payload.get("userId", "")), user)
            if not ok:
                self._responder_json(400, {"ok": False, "error": msg})
                return
            self._responder_json(200, {"message": msg, **resposta_estado(carregar_estado(), self._usuario())})
            return

        # ---- Usuários e permissões ------------------------------------------
        if rota in ("/api/users/save", "/api/users/delete"):
            if not auth.pode(user, "usuarios", "edit"):
                self._negar(user)
                return
            if rota.endswith("save"):
                ok, msg = auth.salvar_usuario(payload, user)
            else:
                ok, msg = auth.excluir_usuario(payload.get("id", ""), user)
            if not ok:
                self._responder_json(400, {"ok": False, "error": msg})
                return
            self._responder_json(200, {"message": "Usuário salvo." if rota.endswith("save") else msg,
                                       **resposta_estado(carregar_estado(), self._usuario())})
            return

        # ---- Site / redes / mesas / configurações (somente as partes permitidas)
        if rota == "/api/state":
            novo = payload.get("state")
            if not isinstance(novo, dict):
                self._responder_json(400, {"ok": False, "error": "Campo 'state' ausente"})
                return
            with _estado_lock:
                estado = carregar_estado()
                aplicadas = erp.mesclar_estado_do_cliente(estado, novo, user)
                if aplicadas:
                    salvar_estado_completo(estado)
            self._responder_json(200, {"ok": True, "applied": aplicadas, "updatedAt": datetime.now().isoformat()})
            return

        if rota == "/api/upload":
            if not (auth.pode(user, "site", "edit") or auth.pode(user, "redes", "edit") or auth.pode(user, "produtos", "edit")):
                self._negar(user)
                return
            m = re.match(r"^data:image/(jpeg|jpg|png|webp|gif);base64,(.+)$", str(payload.get("dataUrl") or ""), re.S)
            if not m:
                self._responder_json(400, {"ok": False, "error": "Imagem inválida"})
                return
            ext = "jpg" if m.group(1) in ("jpeg", "jpg") else m.group(1)
            try:
                conteudo = base64.b64decode(m.group(2), validate=False)
            except Exception:
                self._responder_json(400, {"ok": False, "error": "Base64 inválido"})
                return
            if len(conteudo) > 12 * 1024 * 1024:
                self._responder_json(413, {"ok": False, "error": "Imagem muito grande (máx. 12MB)"})
                return
            nome = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}.{ext}"
            storage.store().media_gravar(nome, f"image/{'jpeg' if ext == 'jpg' else ext}", conteudo)
            self._responder_json(200, {"ok": True, "url": f"/uploads/{nome}"})
            return

        if rota == "/api/instagram/publish":
            if not auth.pode(user, "redes", "use"):
                self._negar(user)
                return
            estado = carregar_estado()
            cfg = estado.get("settings", {})
            ig_cfg = cfg.get("instagramConfig", {})
            legenda = (payload.get("caption") or "").strip() or gerar_legenda_instagram(
                titulo=payload.get("title", "Novidade"), descricao=payload.get("description", ""),
                preco=float(payload.get("price", 0.0) or 0.0), badge=payload.get("badge", ""),
                nome_lounge=cfg.get("brandName", "IMPERADOR LOUNGE BAR"),
                instagram_handle=cfg.get("instagram", ""), endereco=cfg.get("address", ""),
            )
            resultado = publicar_no_instagram_graph_api(
                ig_user_id=ig_cfg.get("igUserId", ""), access_token=ig_cfg.get("accessToken", ""),
                image_url=_url_absoluta(payload.get("imageUrl", cfg.get("heroCoverUrl", "")), estado),
                caption=legenda, post_type=payload.get("postType", "FEED"), webhook_url=ig_cfg.get("webhookUrl", ""),
            )
            self._responder_json(200, {"ok": True, "caption": legenda, "instagramResult": resultado})
            return

        if rota == "/api/facebook/publish":
            if not auth.pode(user, "redes", "use"):
                self._negar(user)
                return
            estado = carregar_estado()
            fb = (estado.get("home") or {}).get("facebookConfig", {}) or {}
            self._responder_json(200, publicar_no_facebook_pagina(
                page_id=fb.get("pageId", ""), page_token=fb.get("pageToken", ""),
                image_url=_url_absoluta(payload.get("imageUrl", ""), estado), caption=payload.get("caption", ""),
            ))
            return

        if rota == "/api/reset":
            if not user.get("isAdmin"):
                self._negar(user)
                return
            with _estado_lock:
                padrao = obter_dados_iniciais_imperador()
                erp.garantir_erp(padrao)
                salvar_estado_completo(padrao)
            self._responder_json(200, resposta_estado(padrao, user))
            return

        self._responder_json(404, {"ok": False, "error": "Endpoint não encontrado"})

    def log_message(self, format: str, *args) -> None:
        sys.stdout.write(f"[IMPERADOR] {self.address_string()} - {format % args}\n")


class ServidorDuplo(ThreadingHTTPServer):
    """Aceita IPv4 e IPv6 na mesma porta (localhost responde rápido no Windows e no Railway)."""
    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def criar_servidor() -> ThreadingHTTPServer:
    try:
        return ServidorDuplo(("::", PORT), ImperadorPythonHandler)
    except OSError:
        ThreadingHTTPServer.daemon_threads = True
        return ThreadingHTTPServer(("0.0.0.0", PORT), ImperadorPythonHandler)


def iniciar_servidor() -> None:
    inicializar_banco()
    auth.inicializar_auth()
    carregar_estado()
    servidor = criar_servidor()

    url_local = f"http://localhost:{PORT}"
    print("=" * 74)
    print("IMPERADOR LOUNGE BAR - SISTEMA EM PYTHON + SQLITE3 INICIADO")
    print("=" * 74)
    print(f"Site / Home:              {url_local}")
    print(f"Cardápio Digital (QR):    {url_local}/?view=menu")
    print(f"Tablet na mesa (PIX):     {url_local}/?view=tablet")
    print(f"Painel administrativo:    {url_local}/?view=admin")
    print(f"Banco de dados:           {storage.descricao()}")
    if os.environ.get("RAILWAY_ENVIRONMENT") and not storage.USANDO_POSTGRES:
        print("ATENÇÃO: rodando no Railway SEM PostgreSQL. Defina DATABASE_URL = ${{Postgres.DATABASE_URL}}")
        print("         no serviço do sistema; sem isso os dados são perdidos a cada deploy.")
    if auth.precisa_trocar_senha_padrao():
        print(f"Primeiro acesso: usuário '{auth.USUARIO_PADRAO}' / senha '{auth.SENHA_PADRAO}' (será pedido para trocar)")
    print("=" * 74)
    print("Pressione CTRL+C para encerrar o servidor.")

    if os.environ.get("NO_BROWSER") != "1" and not storage.USANDO_POSTGRES and not os.environ.get("RAILWAY_ENVIRONMENT"):
        threading.Timer(1.0, lambda: webbrowser.open(url_local)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando servidor...")
        servidor.server_close()


if __name__ == "__main__":
    iniciar_servidor()

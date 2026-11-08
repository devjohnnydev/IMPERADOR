# -*- coding: utf-8 -*-
"""
Interpreta pedidos escritos no chat pelo cliente, em português do dia a dia.

Exemplos:
    "mais um balde de cerveja"          -> 1x Balde Imperial c/ 6 Heineken
    "2 caipirinhas e uma batata"        -> 2x Caipiroska / 1x Batata Frita Suprema
    "traz a conta" / "chama o garçom"   -> chamado para o atendente

Funciona sem internet: compara as palavras com os nomes, descrições e
categorias do cardápio (com sinônimos comuns).
"""

import re
import unicodedata
from typing import Dict, List, Tuple

NUMEROS = {
    "um": 1, "uma": 1, "outro": 1, "outra": 1, "mais": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
    "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10, "meia duzia": 6, "uma duzia": 12, "duzia": 12,
}

PARADAS = {
    "de", "do", "da", "dos", "das", "com", "sem", "o", "a", "os", "as", "um", "uma", "uns", "umas", "e", "mais",
    "quero", "queria", "gostaria", "pode", "poderia", "me", "manda", "mande", "traz", "traga", "trazer", "ve", "vê",
    "ver", "por", "favor", "pf", "pfv", "pra", "para", "aqui", "mesa", "na", "no", "outro", "outra", "pedir",
    "pedido", "ai", "aí", "tambem", "também", "so", "só", "bem", "gelado", "gelada", "geladas", "gelados", "ja", "já",
    "obrigado", "obrigada", "valeu", "oi", "ola", "olá", "boa", "noite", "tarde", "dia", "eu", "nos", "nós", "vou",
}

# palavra do cliente -> palavras que podem aparecer no cardápio
SINONIMOS = {
    "cerveja": ["cerveja", "heineken", "corona", "original", "long", "neck", "balde", "chopp"],
    "cervejas": ["cerveja", "heineken", "corona", "original"],
    "breja": ["cerveja", "heineken", "corona", "original"],
    "gelo": ["gelo"],
    "refri": ["refrigerante"],
    "refrigerante": ["refrigerante"],
    "coca": ["refrigerante"],
    "agua": ["agua"],
    "caipirinha": ["caipirinha", "caipiroska"],
    "caipirinhas": ["caipirinha", "caipiroska"],
    "caipiroska": ["caipiroska", "caipirinha"],
    "narguile": ["narguile", "sessao", "rosh"],
    "narga": ["narguile", "sessao", "rosh"],
    "rosh": ["rosh", "sessao", "narguile"],
    "essencia": ["rosh", "troca"],
    "carvao": ["carvao"],
    "batata": ["batata", "fritas"],
    "fritas": ["batata", "fritas"],
    "hamburguer": ["burger"],
    "lanche": ["burger"],
    "burguer": ["burger"],
    "energetico": ["red", "bull", "energetico"],
    "redbull": ["red", "bull"],
    "gin": ["gin", "tanqueray"],
    "whisky": ["whisky"],
    "uisque": ["whisky"],
    "vodka": ["vodka", "absolut", "caipiroska"],
    "picanha": ["picanha", "tabua"],
    "sobremesa": ["sobremesa", "petit", "gateau"],
    "drink": ["drink"],
    "drinks": ["drink"],
}

TIPOS_EMBALAGEM = {"combo", "balde", "taca", "double", "garrafa", "dose", "porcao", "tabua"}

INTENCOES = [
    (r"\b(conta|fechar|fecha|pagar|pagamento)\b", "conta", "O cliente pediu a conta"),
    (r"\b(garcom|garçom|atendente|alguem|ajuda)\b", "garcom", "O cliente chamou o atendente pelo chat"),
    (r"\b(carvao|brasa)\b.*\b(trocar|troca|acender)\b|\b(trocar|troca)\b.*\b(carvao|brasa)\b", "carvao", "Troca de carvão pedida pelo chat"),
]


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFD", (texto or "").lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9\s,+;/]", " ", texto)


def _singular(p: str) -> str:
    if len(p) > 4 and p.endswith("oes"):
        return p[:-3] + "ao"
    if len(p) > 3 and p.endswith("s") and not p.endswith("ss"):
        return p[:-1]
    return p


def _tokens(texto: str) -> List[str]:
    return [_singular(t) for t in normalizar(texto).split() if t and t not in PARADAS and not t.isdigit()]


def _indice(itens: List[Dict], categorias: Dict[str, str]) -> List[Tuple[Dict, set, set]]:
    indice = []
    for item in itens:
        nome = set(_tokens(item.get("name", "")))
        extra = set(_tokens(item.get("description", ""))) | set(_tokens(categorias.get(item.get("categoryId"), "")))
        indice.append((item, nome, extra))
    return indice


def _pontuar(palavras: List[str], nome: set, extra: set) -> float:
    if not palavras:
        return 0.0
    pontos = 0.0
    for p in palavras:
        alvos = {p} | {_singular(s) for s in SINONIMOS.get(p, [])}
        if alvos & nome:
            pontos += 2.0 if p in nome else 1.4
        elif alvos & extra:
            pontos += 0.6
        elif any(len(p) >= 4 and (n.startswith(p) or p.startswith(n)) for n in nome if len(n) >= 4):
            pontos += 1.0
    # "combo", "balde", "taça"... só valem quando o cliente falou disso
    pedidos = set(palavras)
    for tipo in TIPOS_EMBALAGEM & nome:
        if tipo not in pedidos:
            pontos -= 0.9
    # favorece itens com nome curto/específico
    return pontos / (1 + 0.08 * len(nome))


def _quantidade(trecho: str) -> Tuple[int, str]:
    t = normalizar(trecho).strip()
    m = re.match(r"^\s*(\d{1,2})\s*x?\s*(.*)$", t)
    if m:
        return max(1, min(30, int(m.group(1)))), m.group(2)
    for expr in sorted(NUMEROS, key=len, reverse=True):
        if t.startswith(expr + " "):
            return NUMEROS[expr], t[len(expr):]
    m = re.search(r"\b(\d{1,2})\b", t)
    if m:
        return max(1, min(30, int(m.group(1)))), t
    return 1, t


def _trechos(texto: str) -> List[str]:
    t = normalizar(texto)
    partes = re.split(r"[,;+/\n]| e (?=\d|um |uma |dois |duas |tres |quatro |cinco |seis |mais |outr)| mais (?=\d|um |uma |dois |duas )", t)
    return [p.strip() for p in partes if p and p.strip()]


def interpretar(texto: str, itens: List[Dict], categorias: Dict[str, str], ja_pedidos: List[str] = None) -> Dict:
    """Retorna {"items": [...], "ambiguous": [...], "unknown": [...], "intent": (tipo, msg) | None}."""
    resultado = {"items": [], "ambiguous": [], "unknown": [], "intent": None}
    norm = normalizar(texto)
    indice = _indice(itens, categorias)

    for padrao, tipo, msg in INTENCOES:
        if re.search(padrao, norm) and not re.search(r"\d", norm):
            # "conta" / "garçom" sem itens junto: é um chamado
            if not any(_pontuar(_tokens(norm), n, e) >= 1.6 for _, n, e in indice):
                resultado["intent"] = (tipo, msg)
                return resultado

    for trecho in _trechos(texto):
        qtd, resto = _quantidade(trecho)
        palavras = _tokens(resto)
        if not palavras:
            continue
        notas = []
        m = re.search(r"\b(sem|com pouco|bem gelad\w*|extra)\b.*$", resto)
        if m:
            notas.append(m.group(0).strip())
        ranking = sorted(((_pontuar(palavras, n, e), it) for it, n, e in indice), key=lambda x: -x[0])
        if not ranking or ranking[0][0] < 0.9:
            resultado["unknown"].append(trecho)
            continue
        melhor, segundo = ranking[0], (ranking[1] if len(ranking) > 1 else (0, None))
        proximos = [it for sc, it in ranking[:4] if sc >= melhor[0] * 0.85]
        # "mais um ..." quando a mesa já pediu um dos itens possíveis: repete o mesmo
        repetidos = [it for it in proximos if it["id"] in (ja_pedidos or [])]
        if len(proximos) > 1 and len(repetidos) == 1:
            melhor = (melhor[0], repetidos[0])
            proximos = [repetidos[0]]
        if len(proximos) > 1 and melhor[0] - segundo[0] < 0.35:
            resultado["ambiguous"].append({"text": trecho, "qty": qtd, "options": [
                {"itemId": it["id"], "name": it["name"], "price": it.get("price", 0)} for it in proximos[:4]]})
            continue
        item = melhor[1]
        existente = next((x for x in resultado["items"] if x["itemId"] == item["id"]), None)
        if existente:
            existente["qty"] += qtd
        else:
            resultado["items"].append({"itemId": item["id"], "name": item["name"], "price": item.get("price", 0),
                                       "qty": qtd, "notes": "; ".join(notas)})
    return resultado

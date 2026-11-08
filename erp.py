# -*- coding: utf-8 -*-
"""
Regras de negócio do Imperador Lounge Bar (executadas no servidor).

Fluxo da mercadoria:
  1. RECEBIMENTO  - o conferente lança a nota (fornecedor, número, valor, itens) e a
                    quantidade realmente conferida de cada item.
  2. APROVAÇÃO    - gerente/financeiro aprova: entra no DEPÓSITO e atualiza o custo médio.
  3. ESTOQUE      - transferências do depósito para o BAR:
                      * "bar"  -> unidades fechadas para VENDA (ex.: garrafa vendida no combo)
                      * "uso"  -> unidade aberta para PRODUÇÃO (ex.: vodka da caipirinha, em ml)
  4. VENDA        - cada item do cardápio tem uma ficha técnica (composição). A venda baixa
                    o estoque do bar/uso, calcula o custo (CMV) e registra o vendedor.

Permissões: cada ação exige um nível mínimo no módulo (view < use < edit).
"""

import copy
import secrets
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

import auth
import chat_pedido
import time as _time

LOCAIS = ("deposito", "bar", "uso")
NOME_LOCAL = {"deposito": "Depósito", "bar": "Bar (venda)", "uso": "Bar (uso/produção)"}
MAX_MOVIMENTOS = 3000


class ErroNegocio(Exception):
    pass


def _agora() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def _id(prefixo: str) -> str:
    return f"{prefixo}-{datetime.now().strftime('%y%m%d')}-{secrets.token_hex(3).upper()}"


def _num(valor: Any, padrao: float = 0.0) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return padrao


def _txt(valor: Any, limite: int = 200) -> str:
    return str(valor or "").strip()[:limite]


# ---------------------------------------------------------------------------
# Dados iniciais / migração
# ---------------------------------------------------------------------------
def _produto(pid, nome, categoria, unidade, conteudo, unid_conteudo, custo, dep, bar, uso, minimo):
    return {
        "id": pid, "name": nome, "category": categoria, "unit": unidade,
        "content": conteudo, "contentUnit": unid_conteudo, "avgCost": custo, "lastCost": custo,
        "minStock": minimo, "stock": {"deposito": dep, "bar": bar, "uso": uso}, "active": True,
    }


PRODUTOS_INICIAIS = [
    _produto("P-VODKA", "Vodka Absolut 1L", "Destilados", "garrafa", 1000, "ml", 100.0, 4, 0, 1000, 2),
    _produto("P-GIN", "Gin Tanqueray 750ml", "Destilados", "garrafa", 750, "ml", 95.0, 6, 2, 750, 2),
    _produto("P-HEINEKEN", "Heineken Long Neck 330ml", "Cervejas", "unidade", 1, "un", 5.2, 96, 24, 0, 48),
    _produto("P-REDBULL", "Red Bull 250ml", "Energéticos", "lata", 1, "un", 6.5, 48, 12, 0, 24),
    _produto("P-LIMAO", "Limão Taiti", "Hortifruti", "kg", 1000, "g", 6.0, 4, 0, 2000, 2),
    _produto("P-ACUCAR", "Açúcar refinado", "Mercearia", "kg", 1000, "g", 4.5, 4, 0, 1000, 2),
    _produto("P-ESSENCIA", "Essência Ziggy 50g", "Tabacaria", "pacote", 50, "g", 28.0, 10, 0, 100, 4),
    _produto("P-CARVAO", "Carvão de coco 1kg", "Tabacaria", "pacote", 1000, "g", 25.0, 10, 0, 3000, 3),
    _produto("P-PICANHA", "Picanha maturada", "Carnes", "kg", 1000, "g", 75.0, 8, 0, 2000, 3),
    _produto("P-BATATA", "Batata congelada 2kg", "Congelados", "pacote", 2000, "g", 32.0, 10, 0, 4000, 3),
]

FICHAS_INICIAIS = {
    "item-caipiroska-imperial": [("P-VODKA", 60, "uso"), ("P-LIMAO", 120, "uso"), ("P-ACUCAR", 30, "uso")],
    "item-combo-absolut": [("P-VODKA", 1, "bar"), ("P-REDBULL", 5, "bar")],
    "item-combo-tanqueray": [("P-GIN", 1, "bar"), ("P-REDBULL", 5, "bar")],
    "item-drink-imperador-gold": [("P-GIN", 60, "uso")],
    "item-heineken-avulsa": [("P-HEINEKEN", 1, "bar")],
    "item-balde-heineken-6": [("P-HEINEKEN", 6, "bar")],
    "item-redbull-lata": [("P-REDBULL", 1, "bar")],
    "item-sessao-simples": [("P-ESSENCIA", 15, "uso"), ("P-CARVAO", 150, "uso")],
    "item-troca-rosh-avulso": [("P-ESSENCIA", 15, "uso"), ("P-CARVAO", 100, "uso")],
    "item-rosh-imperial-double": [("P-ESSENCIA", 30, "uso"), ("P-CARVAO", 250, "uso")],
    "item-carvao-extra": [("P-CARVAO", 100, "uso")],
    "item-tabua-imperador-chapa": [("P-PICANHA", 500, "uso"), ("P-BATATA", 400, "uso")],
    "item-batata-suprema": [("P-BATATA", 400, "uso")],
}


def garantir_erp(estado: Dict) -> bool:
    """Cria a estrutura do ERP quando ainda não existe. Retorna True se alterou o estado."""
    alterou = False
    if not isinstance(estado.get("erp"), dict):
        estado["erp"] = {
            "products": copy.deepcopy(PRODUTOS_INICIAIS),
            "receipts": [],
            "movements": [],
        }
        for item in estado.get("menuItems", []) or []:
            ficha = FICHAS_INICIAIS.get(item.get("id"))
            if ficha:
                item["composition"] = [{"productId": p, "qty": q, "from": f} for p, q, f in ficha]
            item.setdefault("targetMarkup", 100)
        alterou = True
    erp = estado["erp"]
    for chave in ("products", "receipts", "movements", "purchaseOrders", "inventories"):
        if not isinstance(erp.get(chave), list):
            erp[chave] = []
            alterou = True
    if not isinstance(erp.get("suppliers"), dict):
        erp["suppliers"] = {}
        alterou = True
    if not isinstance(estado.get("tv"), dict):
        estado["tv"] = {"promos": [], "hideValues": False, "showRestock": True, "call": None}
        alterou = True
    if not isinstance(estado.get("chats"), list):
        estado["chats"] = []
        alterou = True
    if not isinstance(estado.get("iam"), dict) or not isinstance(estado["iam"].get("devices"), list):
        estado["iam"] = {"devices": []}
        alterou = True
    cfg = estado.setdefault("settings", {})
    if not isinstance(cfg.get("commission"), dict):
        cfg["commission"] = {"mode": "individual", "percent": 5}
        alterou = True
    for chave in ("orders", "waiterCalls", "fixedExpenses", "employees"):
        if not isinstance(estado.get(chave), list):
            estado[chave] = []
            alterou = True
    # Pedidos antigos sem data ISO (necessária para relatórios por dia/mês)
    for o in estado["orders"]:
        if not o.get("ts"):
            criado = str(o.get("createdAt") or "")
            try:
                o["ts"] = datetime.strptime(criado[:16], "%Y-%m-%d %H:%M").strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                o["ts"] = _agora()
            alterou = True
    return alterou


# ---------------------------------------------------------------------------
# Utilidades de estoque e custo
# ---------------------------------------------------------------------------
def _produtos(estado: Dict) -> Dict[str, Dict]:
    return {p["id"]: p for p in estado["erp"]["products"]}


def _produto_req(estado: Dict, pid: str) -> Dict:
    prod = _produtos(estado).get(pid)
    if not prod:
        raise ErroNegocio("Produto de estoque não encontrado.")
    return prod


def total_unidades(prod: Dict) -> float:
    st = prod.get("stock", {})
    conteudo = _num(prod.get("content"), 1) or 1
    return _num(st.get("deposito")) + _num(st.get("bar")) + _num(st.get("uso")) / conteudo


def custo_componente(prod: Dict, qtd: float, origem: str) -> float:
    custo_unit = _num(prod.get("avgCost"))
    if origem == "uso":
        return custo_unit / (_num(prod.get("content"), 1) or 1) * qtd
    return custo_unit * qtd


def custo_item_venda(estado: Dict, item: Dict) -> float:
    composicao = item.get("composition") or []
    if not composicao:
        return _num(item.get("costPrice"))
    produtos = _produtos(estado)
    total = 0.0
    for c in composicao:
        prod = produtos.get(c.get("productId"))
        if prod:
            total += custo_componente(prod, _num(c.get("qty")), c.get("from", "bar"))
    return round(total + _num(item.get("extraCost")), 4)


def _mov(estado: Dict, tipo: str, prod: Dict, qtd: float, unidade: str, origem: str, destino: str,
         user: Optional[Dict], nota: str = "", ref: str = "", custo: float = 0.0) -> None:
    movs = estado["erp"]["movements"]
    movs.insert(0, {
        "id": _id("MOV"), "at": _agora(), "type": tipo,
        "productId": prod["id"], "productName": prod["name"],
        "qty": round(qtd, 3), "unit": unidade, "from": origem, "to": destino,
        "ref": ref, "note": nota, "cost": round(custo, 2),
        "userId": (user or {}).get("id", ""), "userName": (user or {}).get("name", "Autoatendimento"),
    })
    del movs[MAX_MOVIMENTOS:]


def _baixar_estoque_venda(estado: Dict, item: Dict, qtd: int, user: Optional[Dict], ref: str) -> Tuple[float, List[Dict]]:
    """Baixa o estoque conforme a ficha técnica. Retorna (custo total, uso para estorno)."""
    composicao = item.get("composition") or []
    if not composicao:
        return _num(item.get("costPrice")) * qtd, []
    produtos = _produtos(estado)
    custo = 0.0
    usos = []
    for c in composicao:
        prod = produtos.get(c.get("productId"))
        if not prod:
            continue
        origem = c.get("from", "bar") if c.get("from") in ("bar", "uso") else "bar"
        quantidade = _num(c.get("qty")) * qtd
        estoque = prod.setdefault("stock", {"deposito": 0, "bar": 0, "uso": 0})
        estoque[origem] = round(_num(estoque.get(origem)) - quantidade, 4)
        valor = custo_componente(prod, quantidade, origem)
        custo += valor
        unidade = prod.get("contentUnit", "un") if origem == "uso" else prod.get("unit", "un")
        _mov(estado, "venda", prod, quantidade, unidade, origem, "cliente", user, item.get("name", ""), ref, valor)
        usos.append({"productId": prod["id"], "from": origem, "qty": quantidade})
    return custo + _num(item.get("extraCost")) * qtd, usos


def _estornar_estoque(estado: Dict, usos: List[Dict], user: Dict, ref: str) -> None:
    produtos = _produtos(estado)
    for u in usos or []:
        prod = produtos.get(u.get("productId"))
        if not prod:
            continue
        estoque = prod.setdefault("stock", {"deposito": 0, "bar": 0, "uso": 0})
        estoque[u["from"]] = round(_num(estoque.get(u["from"])) + _num(u.get("qty")), 4)
        unidade = prod.get("contentUnit", "un") if u["from"] == "uso" else prod.get("unit", "un")
        _mov(estado, "estorno", prod, _num(u.get("qty")), unidade, "cliente", u["from"], user, "Cancelamento", ref)


# ---------------------------------------------------------------------------
# Recebimento e aprovação
# ---------------------------------------------------------------------------
def _limpar_itens_nota(estado: Dict, itens_in: List[Dict]) -> List[Dict]:
    produtos = _produtos(estado)
    itens = []
    for it in (itens_in or [])[:200]:
        pid = _txt(it.get("productId"), 40)
        nome = _txt(it.get("name"), 120)
        if pid and pid in produtos:
            nome = produtos[pid]["name"]
        elif not nome:
            continue
        else:
            pid = ""
        qtd_nota = max(0.0, _num(it.get("noteQty")))
        qtd_rec = max(0.0, _num(it.get("receivedQty"), qtd_nota))
        custo = max(0.0, _num(it.get("unitCost")))
        itens.append({
            "productId": pid, "name": nome,
            "newProduct": None if pid else {
                "category": _txt((it.get("newProduct") or {}).get("category"), 40) or "Outros",
                "unit": _txt((it.get("newProduct") or {}).get("unit"), 20) or "unidade",
                "content": max(1.0, _num((it.get("newProduct") or {}).get("content"), 1)),
                "contentUnit": _txt((it.get("newProduct") or {}).get("contentUnit"), 10) or "un",
            },
            "noteQty": qtd_nota, "receivedQty": qtd_rec, "unitCost": custo,
            "total": round(qtd_nota * custo, 2),
            "divergent": abs(qtd_nota - qtd_rec) > 1e-9,
            "lot": _txt(it.get("lot"), 40), "expiry": _txt(it.get("expiry"), 10),
        })
    if not itens:
        raise ErroNegocio("Adicione pelo menos um item à nota.")
    return itens


def acao_nota_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    notas = estado["erp"]["receipts"]
    nid = _txt(p.get("id"), 40)
    nota = next((n for n in notas if n["id"] == nid), None) if nid else None
    if nota:
        if nota["status"] != "pendente":
            raise ErroNegocio("Esta nota já foi analisada e não pode mais ser alterada.")
        if nota.get("createdBy") != user["id"] and not auth.pode(user, "recebimento", "edit"):
            raise ErroNegocio("Você só pode alterar as notas que lançou.")
    itens = _limpar_itens_nota(estado, p.get("items"))
    valor_nota = round(max(0.0, _num(p.get("noteValue"))), 2)
    soma = round(sum(i["total"] for i in itens), 2)
    dados = {
        "number": _txt(p.get("number"), 40), "series": _txt(p.get("series"), 10),
        "supplier": _txt(p.get("supplier"), 120), "supplierDoc": _txt(p.get("supplierDoc"), 30),
        "issueDate": _txt(p.get("issueDate"), 10), "receivedDate": _txt(p.get("receivedDate"), 10) or _agora()[:10],
        "noteValue": valor_nota, "itemsTotal": soma, "valueDivergence": round(valor_nota - soma, 2),
        "hasQtyDivergence": any(i["divergent"] for i in itens),
        "items": itens, "notes": _txt(p.get("notes"), 500),
        "purchaseOrderId": _txt(p.get("purchaseOrderId"), 40),
    }
    if not dados["supplier"] or not dados["number"]:
        raise ErroNegocio("Informe o fornecedor e o número da nota.")
    if nota:
        nota.update(dados)
        nota["updatedAt"] = _agora()
        return "Nota atualizada."
    nota = {"id": _id("NF"), "status": "pendente", "createdAt": _agora(),
            "createdBy": user["id"], "createdByName": user["name"], **dados}
    notas.insert(0, nota)
    return "Nota lançada e enviada para aprovação."


def acao_nota_excluir(estado: Dict, p: Dict, user: Dict) -> str:
    notas = estado["erp"]["receipts"]
    nota = next((n for n in notas if n["id"] == p.get("id")), None)
    if not nota:
        raise ErroNegocio("Nota não encontrada.")
    if nota["status"] != "pendente":
        raise ErroNegocio("Somente notas pendentes podem ser excluídas.")
    if nota.get("createdBy") != user["id"] and not auth.pode(user, "recebimento", "edit"):
        raise ErroNegocio("Você só pode excluir as notas que lançou.")
    estado["erp"]["receipts"] = [n for n in notas if n is not nota]
    return "Nota excluída."


def acao_nota_analisar(estado: Dict, p: Dict, user: Dict) -> str:
    nota = next((n for n in estado["erp"]["receipts"] if n["id"] == p.get("id")), None)
    if not nota:
        raise ErroNegocio("Nota não encontrada.")
    if nota["status"] != "pendente":
        raise ErroNegocio("Esta nota já foi analisada.")
    decisao = p.get("decision")
    observacao = _txt(p.get("note"), 300)
    if decisao == "rejeitar":
        if not observacao:
            raise ErroNegocio("Informe o motivo da rejeição.")
        nota.update({"status": "rejeitada", "reviewedBy": user["id"], "reviewedByName": user["name"],
                     "reviewedAt": _agora(), "reviewNote": observacao})
        return "Nota rejeitada."
    if decisao != "aprovar":
        raise ErroNegocio("Decisão inválida.")

    produtos = _produtos(estado)
    for it in nota["items"]:
        prod = produtos.get(it.get("productId"))
        if not prod:
            novo = it.get("newProduct") or {}
            prod = {
                "id": _id("P"), "name": it["name"], "category": novo.get("category", "Outros"),
                "unit": novo.get("unit", "unidade"), "content": _num(novo.get("content"), 1),
                "contentUnit": novo.get("contentUnit", "un"), "avgCost": 0.0, "lastCost": 0.0,
                "minStock": 0, "stock": {"deposito": 0, "bar": 0, "uso": 0}, "active": True,
            }
            estado["erp"]["products"].append(prod)
            produtos[prod["id"]] = prod
            it["productId"] = prod["id"]
        qtd = _num(it.get("receivedQty"))
        if qtd <= 0:
            continue
        atual = max(0.0, total_unidades(prod))
        custo = _num(it.get("unitCost"))
        prod["avgCost"] = round((atual * _num(prod.get("avgCost")) + qtd * custo) / (atual + qtd), 4) if (atual + qtd) else custo
        prod["lastCost"] = custo
        prod["stock"]["deposito"] = round(_num(prod["stock"].get("deposito")) + qtd, 4)
        _mov(estado, "entrada", prod, qtd, prod.get("unit", "un"), "fornecedor", "deposito", user,
             f"NF {nota.get('number')} - {nota.get('supplier')}", nota["id"], qtd * custo)
    nota.update({"status": "aprovada", "reviewedBy": user["id"], "reviewedByName": user["name"],
                 "reviewedAt": _agora(), "reviewNote": observacao})
    pc = next((x for x in estado["erp"].get("purchaseOrders", []) if x.get("id") == nota.get("purchaseOrderId")), None)
    if pc and pc.get("status") in ("rascunho", "enviado"):
        pc.update({"status": "recebido", "receivedAt": _agora(), "receiptId": nota["id"]})
    return "Nota aprovada: itens lançados no depósito."


# ---------------------------------------------------------------------------
# Estoque
# ---------------------------------------------------------------------------
def acao_produto_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    nome = _txt(p.get("name"), 120)
    if not nome:
        raise ErroNegocio("Informe o nome do produto.")
    dados = {
        "name": nome, "category": _txt(p.get("category"), 40) or "Outros",
        "unit": _txt(p.get("unit"), 20) or "unidade",
        "content": max(1.0, _num(p.get("content"), 1)), "contentUnit": _txt(p.get("contentUnit"), 10) or "un",
        "minStock": max(0.0, _num(p.get("minStock"))), "active": bool(p.get("active", True)),
        "supplier": _txt(p.get("supplier"), 120),
    }
    pid = _txt(p.get("id"), 40)
    if pid:
        prod = _produto_req(estado, pid)
        prod.update(dados)
        if p.get("avgCost") not in (None, ""):
            prod["avgCost"] = max(0.0, _num(p.get("avgCost")))
        return "Produto atualizado."
    prod = {"id": _id("P"), **dados, "avgCost": max(0.0, _num(p.get("avgCost"))), "lastCost": max(0.0, _num(p.get("avgCost"))),
            "stock": {"deposito": 0, "bar": 0, "uso": 0}}
    estado["erp"]["products"].append(prod)
    return "Produto cadastrado. Para dar entrada, lance uma nota no Recebimento ou faça um ajuste."


def acao_produto_excluir(estado: Dict, p: Dict, user: Dict) -> str:
    prod = _produto_req(estado, p.get("id"))
    if total_unidades(prod) > 0:
        raise ErroNegocio("Zere o estoque antes de excluir (ou desative o produto).")
    estado["erp"]["products"] = [x for x in estado["erp"]["products"] if x is not prod]
    for item in estado.get("menuItems", []) or []:
        item["composition"] = [c for c in (item.get("composition") or []) if c.get("productId") != prod["id"]]
    return "Produto excluído."


def acao_transferir(estado: Dict, p: Dict, user: Dict) -> str:
    prod = _produto_req(estado, p.get("productId"))
    origem, destino = p.get("from"), p.get("to")
    rotas_validas = {("deposito", "bar"), ("deposito", "uso"), ("bar", "deposito"), ("bar", "uso")}
    if (origem, destino) not in rotas_validas:
        raise ErroNegocio("Transferência inválida.")
    qtd = _num(p.get("qty"))
    if qtd <= 0 or abs(qtd - round(qtd)) > 1e-9:
        raise ErroNegocio("Informe uma quantidade inteira de unidades.")
    estoque = prod["stock"]
    if _num(estoque.get(origem)) + 1e-9 < qtd:
        raise ErroNegocio(f"Saldo insuficiente em {NOME_LOCAL[origem]} ({_num(estoque.get(origem)):g} {prod.get('unit')}).")
    estoque[origem] = round(_num(estoque.get(origem)) - qtd, 4)
    if destino == "uso":
        estoque["uso"] = round(_num(estoque.get("uso")) + qtd * _num(prod.get("content"), 1), 4)
    else:
        estoque[destino] = round(_num(estoque.get(destino)) + qtd, 4)
    _mov(estado, "transferencia", prod, qtd, prod.get("unit", "un"), origem, destino, user,
         _txt(p.get("note"), 200), "", custo_componente(prod, qtd, "bar"))
    return f"{qtd:g} {prod.get('unit')} transferido(s) de {NOME_LOCAL[origem]} para {NOME_LOCAL[destino]}."


def acao_ajustar(estado: Dict, p: Dict, user: Dict) -> str:
    prod = _produto_req(estado, p.get("productId"))
    local = p.get("location")
    if local not in LOCAIS:
        raise ErroNegocio("Local inválido.")
    qtd = _num(p.get("qty"))
    motivo = _txt(p.get("reason"), 40)
    if qtd == 0:
        raise ErroNegocio("Informe a quantidade do ajuste (positiva para entrada, negativa para saída).")
    if not motivo:
        raise ErroNegocio("Informe o motivo do ajuste.")
    estoque = prod["stock"]
    estoque[local] = round(_num(estoque.get(local)) + qtd, 4)
    unidade = prod.get("contentUnit", "un") if local == "uso" else prod.get("unit", "un")
    _mov(estado, "ajuste" if motivo != "Perda/Quebra" else "perda", prod, qtd, unidade,
         local if qtd < 0 else "ajuste", "ajuste" if qtd < 0 else local, user,
         f"{motivo}: {_txt(p.get('note'), 160)}".strip(": "), "", abs(custo_componente(prod, abs(qtd), local)))
    return "Ajuste registrado."


# ---------------------------------------------------------------------------
# Produtos de venda: ficha técnica e preço por margem
# ---------------------------------------------------------------------------
def acao_preco_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    item = next((i for i in estado.get("menuItems", []) if i.get("id") == p.get("menuItemId")), None)
    if not item:
        raise ErroNegocio("Item do cardápio não encontrado.")
    produtos = _produtos(estado)
    if "composition" in p:
        comp = []
        for c in (p.get("composition") or [])[:30]:
            if c.get("productId") in produtos and _num(c.get("qty")) > 0:
                comp.append({"productId": c["productId"], "qty": _num(c.get("qty")),
                             "from": "uso" if c.get("from") == "uso" else "bar"})
        item["composition"] = comp
    if "extraCost" in p:
        item["extraCost"] = max(0.0, _num(p.get("extraCost")))
    if "costPrice" in p:
        item["costPrice"] = max(0.0, _num(p.get("costPrice")))
    if "targetMarkup" in p:
        item["targetMarkup"] = max(0.0, _num(p.get("targetMarkup")))
    if p.get("applySuggested"):
        custo = custo_item_venda(estado, item)
        item["price"] = round(custo * (1 + _num(item.get("targetMarkup")) / 100), 2)
    elif "price" in p and _num(p.get("price")) > 0:
        item["price"] = round(_num(p.get("price")), 2)
    item["costPrice"] = round(custo_item_venda(estado, item), 2) if item.get("composition") else item.get("costPrice", 0)
    return "Ficha técnica e preço salvos."


# ---------------------------------------------------------------------------
# Vendas
# ---------------------------------------------------------------------------
def _montar_pedido(estado: Dict, linhas_in: List[Dict], user: Optional[Dict], ref: str, publico: bool = False) -> Dict:
    itens_cardapio = {i["id"]: i for i in estado.get("menuItems", []) or []}
    if publico:
        marcar_esgotados(estado)
    linhas, custo_total, usos, subtotal = [], 0.0, [], 0.0
    for ln in (linhas_in or [])[:60]:
        item = itens_cardapio.get(ln.get("itemId"))
        qtd = int(max(1, min(99, _num(ln.get("qty"), 1))))
        if not item or item.get("available") is False or (publico and item.get("soldOut")):
            continue
        preco = round(_num(item.get("price")), 2) if publico else round(_num(ln.get("price"), _num(item.get("price"))), 2)
        custo, uso = _baixar_estoque_venda(estado, item, qtd, user, ref)
        custo_total += custo
        usos += uso
        subtotal += preco * qtd
        linhas.append({"itemId": item["id"], "name": item.get("name"), "qty": qtd, "price": preco,
                       "costPrice": round(custo / qtd, 2), "notes": _txt(ln.get("notes"), 160),
                       "categoryId": item.get("categoryId", "")})
    if not linhas:
        raise ErroNegocio("Adicione itens à venda.")
    return {"items": linhas, "subtotal": round(subtotal, 2), "costTotal": round(custo_total, 2), "stockUsage": usos}


def acao_venda_criar(estado: Dict, p: Dict, user: Dict) -> str:
    oid = f"PED-{secrets.randbelow(900000) + 100000}"
    base = _montar_pedido(estado, p.get("items"), user, oid)
    pct = _num((estado.get("settings") or {}).get("serviceFeePercent"), 10)
    taxa = round(base["subtotal"] * pct / 100, 2) if p.get("serviceFee") else 0.0
    pago = bool(p.get("paid"))
    agora = _agora()
    pedido = {
        "id": oid, "tableId": _txt(p.get("tableId"), 40) or "Balcão",
        "customerName": _txt(p.get("customerName"), 80), "source": "PDV / Vendedor",
        "paymentMethod": _txt(p.get("paymentMethod"), 30) or "Dinheiro",
        "paymentStatus": "pago" if pago else "pendente", "orderStatus": "recebido",
        "createdAt": agora.replace("T", " ")[:16], "ts": agora,
        "serviceFee": taxa, "total": round(base["subtotal"] + taxa, 2),
        "sellerId": user["id"], "sellerName": user["name"], **base,
    }
    mesa = next((t for t in estado.get("tables", []) if t.get("id") == pedido["tableId"]), None)
    if mesa:
        mesa["status"] = "ocupada"
    estado["orders"].insert(0, pedido)
    return f"Venda {oid} registrada ({pedido['total']:.2f})."


def acao_pedido_atualizar(estado: Dict, p: Dict, user: Dict) -> str:
    pedido = next((o for o in estado["orders"] if o.get("id") == p.get("id")), None)
    if not pedido:
        raise ErroNegocio("Pedido não encontrado.")
    proprio = pedido.get("sellerId") == user["id"] or not pedido.get("sellerId")
    pode_editar = auth.pode(user, "vendas", "edit")
    if not pode_editar and not proprio:
        raise ErroNegocio("Você só pode alterar os seus próprios pedidos.")
    if pedido.get("orderStatus") == "cancelado":
        raise ErroNegocio("Pedido cancelado não pode ser alterado.")
    if p.get("cancel"):
        if not pode_editar:
            raise ErroNegocio("Somente quem pode editar Vendas cancela pedidos.")
        motivo = _txt(p.get("reason"), 200)
        if not motivo:
            raise ErroNegocio("Informe o motivo do cancelamento.")
        _estornar_estoque(estado, pedido.get("stockUsage"), user, pedido["id"])
        pedido.update({"orderStatus": "cancelado", "cancelReason": motivo, "cancelledBy": user["name"], "cancelledAt": _agora()})
        return "Pedido cancelado e estoque estornado."
    if p.get("orderStatus") in ("recebido", "preparando", "pronto", "entregue"):
        pedido["orderStatus"] = p["orderStatus"]
    if p.get("paymentStatus") in ("pago", "pendente"):
        pedido["paymentStatus"] = p["paymentStatus"]
        if p.get("paymentMethod"):
            pedido["paymentMethod"] = _txt(p.get("paymentMethod"), 30)
    if p.get("assignToMe") and not pedido.get("sellerId"):
        pedido["sellerId"], pedido["sellerName"] = user["id"], user["name"]
    return "Pedido atualizado."


def acao_chamado_resolver(estado: Dict, p: Dict, user: Dict) -> str:
    for c in estado.get("waiterCalls", []):
        if c.get("id") == p.get("id"):
            c["status"] = "atendido"
            c["resolvedBy"] = user["name"]
    return "Chamado atendido."


def aplicar_sync_publico(estado: Dict, payload: Dict, user: Optional[Dict]) -> int:
    """Pedidos e chamados vindos do cardápio QR / tablet da mesa (sem login, ou com vendedor logado)."""
    adicionados = 0
    ids = {o.get("id") for o in estado["orders"]}
    for ped in (payload.get("orders") or [])[:20]:
        if not isinstance(ped, dict) or not ped.get("id") or ped["id"] in ids:
            continue
        oid = _txt(ped["id"], 40)
        vendedor = user if user and auth.pode(user, "vendas", "use") else None
        try:
            base = _montar_pedido(estado, ped.get("items"), vendedor, oid, publico=True)
        except ErroNegocio:
            continue
        taxa = round(max(0.0, _num(ped.get("serviceFee"))), 2)
        agora = _agora()
        pedido = {
            "id": oid, "tableId": _txt(ped.get("tableId"), 40), "customerName": _txt(ped.get("customerName"), 80),
            "source": _txt(ped.get("source"), 60) or "Cardápio QR Code",
            "paymentMethod": _txt(ped.get("paymentMethod"), 30), "paymentStatus": "pendente",
            "orderStatus": "recebido", "createdAt": agora.replace("T", " ")[:16], "ts": agora,
            "serviceFee": taxa, "total": round(base["subtotal"] + taxa, 2),
            "sellerId": vendedor["id"] if vendedor else "", "sellerName": vendedor["name"] if vendedor else "",
            **base,
        }
        mesa = next((t for t in estado.get("tables", []) if t.get("id") == pedido["tableId"]), None)
        if mesa:
            mesa["status"] = "ocupada"
        estado["orders"].insert(0, pedido)
        ids.add(oid)
        adicionados += 1

    ids_ch = {c.get("id") for c in estado["waiterCalls"]}
    for ch in (payload.get("waiterCalls") or [])[:10]:
        if not isinstance(ch, dict) or not ch.get("id") or ch["id"] in ids_ch:
            continue
        estado["waiterCalls"].insert(0, {
            "id": _txt(ch["id"], 40), "tableId": _txt(ch.get("tableId"), 40), "type": _txt(ch.get("type"), 20),
            "message": _txt(ch.get("message"), 160), "createdAt": _txt(ch.get("createdAt"), 10), "status": "pendente",
        })
        ids_ch.add(ch["id"])
        adicionados += 1
    return adicionados


# ---------------------------------------------------------------------------
# Financeiro (despesas fixas e folha)
# ---------------------------------------------------------------------------
def acao_despesa_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    nome = _txt(p.get("name"), 120)
    if not nome:
        raise ErroNegocio("Informe a descrição da despesa.")
    dados = {"name": nome, "category": _txt(p.get("category"), 40) or "Outros", "dueDate": _txt(p.get("dueDate"), 20),
             "amount": round(max(0.0, _num(p.get("amount"))), 2), "status": "pago" if p.get("status") == "pago" else "pendente",
             "notes": _txt(p.get("notes"), 200)}
    lista = estado["fixedExpenses"]
    atual = next((d for d in lista if d.get("id") == p.get("id")), None) if p.get("id") else None
    if atual:
        atual.update(dados)
        return "Despesa atualizada."
    lista.append({"id": _id("FIX"), **dados})
    return "Despesa cadastrada."


def acao_despesa_excluir(estado: Dict, p: Dict, user: Dict) -> str:
    estado["fixedExpenses"] = [d for d in estado["fixedExpenses"] if d.get("id") != p.get("id")]
    return "Despesa excluída."


def acao_funcionario_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    nome = _txt(p.get("name"), 80)
    if not nome:
        raise ErroNegocio("Informe o nome do funcionário.")
    dados = {"name": nome, "role": _txt(p.get("role"), 60), "shift": _txt(p.get("shift"), 60), "phone": _txt(p.get("phone"), 30),
             "baseSalary": round(max(0.0, _num(p.get("baseSalary"))), 2), "bonuses": round(max(0.0, _num(p.get("bonuses"))), 2),
             "advances": round(max(0.0, _num(p.get("advances"))), 2), "paymentType": _txt(p.get("paymentType"), 30) or "Mensalista",
             "status": "ativo" if p.get("status", "ativo") == "ativo" else "inativo", "paidThisMonth": bool(p.get("paidThisMonth")),
             "userId": _txt(p.get("userId"), 40)}
    lista = estado["employees"]
    atual = next((d for d in lista if d.get("id") == p.get("id")), None) if p.get("id") else None
    if atual:
        atual.update(dados)
        return "Funcionário atualizado."
    lista.append({"id": _id("FUNC"), **dados})
    return "Funcionário cadastrado."


def acao_funcionario_excluir(estado: Dict, p: Dict, user: Dict) -> str:
    estado["employees"] = [d for d in estado["employees"] if d.get("id") != p.get("id")]
    return "Funcionário excluído."




# ---------------------------------------------------------------------------
# Pedido de compra ao fornecedor (reposição do estoque)
# ---------------------------------------------------------------------------
def _proximo_numero_pc(estado: Dict) -> str:
    nums = []
    for pc in estado["erp"].get("purchaseOrders", []):
        try:
            nums.append(int(str(pc.get("number", "PC-0")).split("-")[-1]))
        except ValueError:
            pass
    return f"PC-{(max(nums) + 1) if nums else 1:04d}"


def acao_pc_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    lista = estado["erp"]["purchaseOrders"]
    pc = next((x for x in lista if x.get("id") == p.get("id")), None) if p.get("id") else None
    if pc and pc.get("status") != "rascunho":
        raise ErroNegocio("Somente pedidos em rascunho podem ser alterados.")
    fornecedor = _txt(p.get("supplier"), 120)
    if not fornecedor:
        raise ErroNegocio("Informe o fornecedor.")
    produtos = _produtos(estado)
    itens = []
    for it in (p.get("items") or [])[:120]:
        prod = produtos.get(it.get("productId"))
        qtd = _num(it.get("qty"))
        if not prod or qtd <= 0:
            continue
        custo = max(0.0, _num(it.get("unitCost"), _num(prod.get("lastCost")) or _num(prod.get("avgCost"))))
        itens.append({"productId": prod["id"], "name": prod["name"], "unit": prod.get("unit", "un"),
                      "qty": round(qtd, 3), "unitCost": round(custo, 2), "total": round(qtd * custo, 2)})
    if not itens:
        raise ErroNegocio("Adicione pelo menos um item com quantidade.")
    contato = {"phone": _txt(p.get("supplierPhone"), 30), "email": _txt(p.get("supplierEmail"), 120)}
    dados = {"supplier": fornecedor, "supplierPhone": contato["phone"], "supplierEmail": contato["email"],
             "items": itens, "total": round(sum(i["total"] for i in itens), 2),
             "expectedDate": _txt(p.get("expectedDate"), 10), "notes": _txt(p.get("notes"), 500)}
    estado["erp"]["suppliers"][fornecedor] = contato
    for it in itens:
        if not produtos[it["productId"]].get("supplier"):
            produtos[it["productId"]]["supplier"] = fornecedor
    if pc:
        pc.update(dados)
        pc["updatedAt"] = _agora()
        return f"Pedido {pc['number']} atualizado."
    pc = {"id": _id("PC"), "number": _proximo_numero_pc(estado), "status": "rascunho", "createdAt": _agora(),
          "createdBy": user["id"], "createdByName": user["name"], **dados}
    lista.insert(0, pc)
    return f"Pedido de compra {pc['number']} criado."


def acao_pc_status(estado: Dict, p: Dict, user: Dict) -> str:
    pc = next((x for x in estado["erp"]["purchaseOrders"] if x.get("id") == p.get("id")), None)
    if not pc:
        raise ErroNegocio("Pedido de compra não encontrado.")
    novo = p.get("status")
    validos = {"rascunho": {"enviado", "cancelado"}, "enviado": {"recebido", "cancelado", "rascunho"}}
    if novo not in validos.get(pc.get("status"), set()):
        raise ErroNegocio("Mudança de situação inválida.")
    pc["status"] = novo
    pc[{"enviado": "sentAt", "recebido": "receivedAt", "cancelado": "cancelledAt", "rascunho": "updatedAt"}[novo]] = _agora()
    if novo == "enviado":
        pc["sentBy"] = user["name"]
    return {"enviado": f"Pedido {pc['number']} marcado como enviado ao fornecedor.", "recebido": "Pedido marcado como recebido.",
            "cancelado": "Pedido cancelado.", "rascunho": "Pedido voltou para rascunho."}[novo]


def acao_pc_excluir(estado: Dict, p: Dict, user: Dict) -> str:
    lista = estado["erp"]["purchaseOrders"]
    pc = next((x for x in lista if x.get("id") == p.get("id")), None)
    if not pc:
        raise ErroNegocio("Pedido de compra não encontrado.")
    if pc.get("status") != "rascunho":
        raise ErroNegocio("Somente rascunhos podem ser excluídos (cancele os enviados).")
    estado["erp"]["purchaseOrders"] = [x for x in lista if x is not pc]
    return "Rascunho excluído."


# ---------------------------------------------------------------------------
# Cardápio: disponibilidade manual e "esgotado" automático pelo estoque
# ---------------------------------------------------------------------------
def marcar_esgotados(estado: Dict) -> None:
    """Marca item.soldOut quando o estoque do bar não cobre 1 unidade da ficha técnica."""
    produtos = {p["id"]: p for p in (estado.get("erp") or {}).get("products", [])}
    for item in estado.get("menuItems", []) or []:
        comp = item.get("composition") or []
        esgotado = False
        if comp:
            for c in comp:
                prod = produtos.get(c.get("productId"))
                if prod is None:
                    continue
                if _num((prod.get("stock") or {}).get(c.get("from", "bar"))) + 1e-9 < _num(c.get("qty")):
                    esgotado = True
                    break
        elif isinstance(item.get("stock"), (int, float)):
            esgotado = item["stock"] <= 0
        item["soldOut"] = esgotado


def acao_item_disponibilidade(estado: Dict, p: Dict, user: Dict) -> str:
    item = next((i for i in estado.get("menuItems", []) if i.get("id") == p.get("menuItemId")), None)
    if not item:
        raise ErroNegocio("Item não encontrado.")
    item["available"] = bool(p.get("available"))
    return f"“{item['name']}” {'voltou para o cardápio' if item['available'] else 'saiu do cardápio (não aparece no site, tablet nem chat)'}."


def acao_item_do_produto(estado: Dict, p: Dict, user: Dict) -> str:
    """Cria um item de venda a partir de um produto do estoque (ex.: garrafa vendida inteira)."""
    prod = _produto_req(estado, p.get("productId"))
    cat = _txt(p.get("categoryId"), 40)
    if not any(c.get("id") == cat for c in estado.get("categories", [])):
        raise ErroNegocio("Escolha a categoria do cardápio.")
    origem = "uso" if p.get("from") == "uso" else "bar"
    qtd = max(0.001, _num(p.get("qty"), 1))
    markup = max(0.0, _num(p.get("targetMarkup"), 100))
    custo = custo_componente(prod, qtd, origem)
    preco = _num(p.get("price")) or round(custo * (1 + markup / 100), 2)
    item = {
        "id": _id("item"), "categoryId": cat, "name": _txt(p.get("name"), 120) or prod["name"],
        "description": _txt(p.get("description"), 300), "price": round(preco, 2), "costPrice": round(custo, 2),
        "image": _txt(p.get("image"), 500), "badge": "", "available": True, "targetMarkup": markup,
        "composition": [{"productId": prod["id"], "qty": qtd, "from": origem}],
    }
    estado.setdefault("menuItems", []).append(item)
    preco_txt = f"{preco:.2f}".replace(".", ",")
    return f"“{item['name']}” adicionado ao cardápio por R$ {preco_txt}."


# ---------------------------------------------------------------------------
# Inventário (contagem física x sistema)
# ---------------------------------------------------------------------------
def _inv_aberto(estado: Dict) -> Optional[Dict]:
    return next((i for i in estado["erp"].get("inventories", []) if i.get("status") == "aberto"), None)


def acao_inv_iniciar(estado: Dict, p: Dict, user: Dict) -> str:
    if _inv_aberto(estado):
        raise ErroNegocio("Já existe um inventário em andamento.")
    itens = []
    for prod in estado["erp"]["products"]:
        if prod.get("active") is False:
            continue
        st = prod.get("stock") or {}
        itens.append({"productId": prod["id"], "name": prod["name"], "category": prod.get("category", ""),
                      "unit": prod.get("unit", "un"), "content": _num(prod.get("content"), 1), "contentUnit": prod.get("contentUnit", "un"),
                      "avgCost": _num(prod.get("avgCost")),
                      "system": {loc: _num(st.get(loc)) for loc in LOCAIS}, "counted": {loc: None for loc in LOCAIS}})
    num = len(estado["erp"]["inventories"]) + 1
    inv = {"id": _id("INV"), "number": f"INV-{num:03d}", "status": "aberto", "createdAt": _agora(),
           "createdBy": user["id"], "createdByName": user["name"], "notes": _txt(p.get("notes"), 300), "items": itens}
    estado["erp"]["inventories"].insert(0, inv)
    return f"Inventário {inv['number']} iniciado. Conte os produtos e registre as quantidades."


def acao_inv_contar(estado: Dict, p: Dict, user: Dict) -> str:
    inv = _inv_aberto(estado)
    if not inv or inv["id"] != p.get("id"):
        raise ErroNegocio("Inventário não está aberto.")
    contagens = p.get("counts") or {}
    for it in inv["items"]:
        c = contagens.get(it["productId"])
        if not isinstance(c, dict):
            continue
        for loc in LOCAIS:
            if loc in c:
                v = c.get(loc)
                it["counted"][loc] = None if v in (None, "") else max(0.0, _num(v))
        it["countedBy"] = user["name"]
    inv["updatedAt"] = _agora()
    return "Contagem salva."


def acao_inv_finalizar(estado: Dict, p: Dict, user: Dict) -> str:
    inv = _inv_aberto(estado)
    if not inv or inv["id"] != p.get("id"):
        raise ErroNegocio("Inventário não está aberto.")
    produtos = _produtos(estado)
    ajustes, valor = 0, 0.0
    for it in inv["items"]:
        prod = produtos.get(it["productId"])
        if not prod:
            continue
        for loc in LOCAIS:
            contado = it["counted"].get(loc)
            if contado is None:
                continue
            diff = round(contado - _num(it["system"].get(loc)), 4)
            it.setdefault("diff", {})[loc] = diff
            if abs(diff) < 1e-9:
                continue
            # aplica a diferença sobre o saldo atual (vendas feitas durante a contagem continuam valendo)
            prod["stock"][loc] = round(_num(prod["stock"].get(loc)) + diff, 4)
            v = custo_componente(prod, abs(diff), loc) * (1 if diff > 0 else -1)
            valor += v
            ajustes += 1
            unidade = prod.get("contentUnit", "un") if loc == "uso" else prod.get("unit", "un")
            _mov(estado, "inventario", prod, diff, unidade, "inventario" if diff > 0 else loc, loc if diff > 0 else "inventario",
                 user, f"{inv['number']}: contado {contado:g}, sistema {_num(it['system'].get(loc)):g}", inv["id"], abs(v))
    inv.update({"status": "finalizado", "finishedAt": _agora(), "finishedBy": user["name"],
                "adjustments": ajustes, "valueDiff": round(valor, 2)})
    valor_txt = f"{valor:.2f}".replace(".", ",")
    return f"Inventário finalizado: {ajustes} ajuste(s), diferença de R$ {valor_txt}."


def acao_inv_cancelar(estado: Dict, p: Dict, user: Dict) -> str:
    inv = _inv_aberto(estado)
    if not inv or inv["id"] != p.get("id"):
        raise ErroNegocio("Inventário não está aberto.")
    inv.update({"status": "cancelado", "finishedAt": _agora(), "finishedBy": user["name"]})
    return "Inventário cancelado (nenhum ajuste foi feito)."


# ---------------------------------------------------------------------------
# Modo TV: promoções e chamadas de atendentes
# ---------------------------------------------------------------------------
def acao_tv_config(estado: Dict, p: Dict, user: Dict) -> str:
    tv = estado.setdefault("tv", {})
    if "promos" in p:
        tv["promos"] = [{"id": _txt(x.get("id"), 30) or _id("PRM"), "text": _txt(x.get("text"), 160), "active": bool(x.get("active", True))}
                        for x in (p.get("promos") or [])[:20] if _txt(x.get("text"), 160)]
    for k in ("hideValues", "showRestock"):
        if k in p:
            tv[k] = bool(p.get(k))
    return "Modo TV atualizado."


def acao_tv_chamar(estado: Dict, p: Dict, user: Dict) -> str:
    nome = _txt(p.get("name"), 60)
    if not nome:
        raise ErroNegocio("Informe quem deve ser chamado.")
    local = _txt(p.get("place"), 40) or "Caixa"
    estado.setdefault("tv", {})["call"] = {"id": _id("CALL"), "name": nome, "place": local,
                                           "message": _txt(p.get("message"), 120), "at": _agora(), "by": user["name"]}
    return f"{nome} chamado(a) na TV para {local}."


# ---------------------------------------------------------------------------
# Comissão: igual para todos ou individual por vendedor
# ---------------------------------------------------------------------------
def acao_comissao_config(estado: Dict, p: Dict, user: Dict) -> str:
    modo = "unica" if p.get("mode") == "unica" else "individual"
    pct = max(0.0, min(100.0, _num(p.get("percent"))))
    estado.setdefault("settings", {})["commission"] = {"mode": modo, "percent": pct}
    return "Comissão igual para todos os vendedores." if modo == "unica" else "Comissão individual: cada vendedor tem o seu percentual (em IAM > Usuários)."


# ---------------------------------------------------------------------------
# Chat de pedidos do cliente (nome + mesa -> pedido -> atendente leva e cobra)
# ---------------------------------------------------------------------------
MAX_CHATS = 300
MAX_MSGS = 150


def _mesa_do_texto(estado: Dict, texto: str) -> str:
    texto = _txt(texto, 40)
    mesas = [t.get("id", "") for t in estado.get("tables", []) or []]
    if texto in mesas:
        return texto
    import re as _re
    nums = _re.findall(r"\d+", texto)
    if nums:
        alvo = int(nums[-1])
        for m in mesas:
            achados = _re.findall(r"\d+", m)
            if achados and int(achados[-1]) == alvo and ("camarote" in m.lower()) == ("camarote" in texto.lower()):
                return m
        return f"Mesa {alvo:02d}"
    return texto


def _msg(chat: Dict, quem: str, texto: str, **extra) -> Dict:
    chat["seq"] = int(chat.get("seq", 0)) + 1
    m = {"id": chat["seq"], "from": quem, "text": texto, "at": _agora(), **extra}
    chat["messages"].append(m)
    del chat["messages"][:-MAX_MSGS]
    chat["updatedAt"] = m["at"]
    return m


def _chat_publico(chat: Dict, desde: int = 0) -> Dict:
    return {"id": chat["id"], "name": chat["name"], "table": chat["table"], "status": chat["status"],
            "messages": [m for m in chat["messages"] if m["id"] > desde]}


def _chat_req(estado: Dict, cid: str, token: str) -> Dict:
    chat = next((c for c in estado.get("chats", []) if c.get("id") == cid), None)
    if not chat or not token or chat.get("token") != token:
        raise ErroNegocio("Conversa não encontrada. Comece uma nova.")
    return chat


def chat_iniciar(estado: Dict, p: Dict) -> Dict:
    nome = _txt(p.get("name"), 40)
    mesa = _mesa_do_texto(estado, p.get("table"))
    if not nome or not mesa:
        raise ErroNegocio("Informe o seu nome e o número da mesa.")
    limite = datetime.now().timestamp() - 2 * 86400
    estado["chats"] = [c for c in estado.get("chats", [])
                       if datetime.strptime(c.get("updatedAt", _agora())[:19], "%Y-%m-%dT%H:%M:%S").timestamp() > limite][-MAX_CHATS:]
    chat = {"id": _id("CHAT"), "token": secrets.token_urlsafe(18), "name": nome, "table": mesa, "status": "aberto",
            "createdAt": _agora(), "updatedAt": _agora(), "messages": [], "orderIds": [], "unreadStaff": 0, "seq": 0}
    estado["chats"].append(chat)
    _msg(chat, "bot", f"Olá, {nome}! Você está na {mesa}. Escreva o que deseja, do seu jeito — por exemplo: "
                      f"\"2 caipirinhas e uma batata\" ou \"mais um balde de cerveja\". Para chamar o atendente, escreva \"garçom\"; para pedir a conta, \"conta\".")
    return {"chatId": chat["id"], "token": chat["token"], "chat": _chat_publico(chat)}


def chat_enviar(estado: Dict, p: Dict) -> Dict:
    chat = _chat_req(estado, p.get("chatId"), p.get("token"))
    if chat["status"] != "aberto":
        raise ErroNegocio("Esta conversa foi encerrada. Comece uma nova.")
    texto = _txt(p.get("text"), 300)
    if not texto:
        raise ErroNegocio("Escreva uma mensagem.")
    desde = int(p.get("since") or 0)
    _msg(chat, "cliente", texto)
    chat["unreadStaff"] = int(chat.get("unreadStaff", 0)) + 1

    marcar_esgotados(estado)
    itens_ativos = [i for i in estado.get("menuItems", []) if i.get("available", True) is not False and not i.get("soldOut")]
    cats = {c["id"]: c.get("name", "") for c in estado.get("categories", [])}
    ja = []
    for o in estado.get("orders", []):
        if o.get("id") in chat["orderIds"] or (o.get("tableId") == chat["table"] and o.get("paymentStatus") != "pago"):
            ja += [ln.get("itemId") for ln in o.get("items", [])]
    r = chat_pedido.interpretar(texto, itens_ativos, cats, ja)

    if r["intent"]:
        tipo, motivo = r["intent"]
        estado.setdefault("waiterCalls", []).insert(0, {
            "id": _id("CALL"), "tableId": chat["table"], "type": tipo, "status": "pendente",
            "message": f"{motivo} — {chat['name']}", "createdAt": _agora()[11:16], "chatId": chat["id"]})
        respostas = {"conta": "Pedido de conta enviado! O atendente já vai até a sua mesa para fazer a cobrança.",
                     "garcom": "Já chamei o atendente para a sua mesa.",
                     "carvao": "Pedido de troca de carvão enviado para a tabacaria."}
        _msg(chat, "bot", respostas.get(tipo, "Avisei o atendente."))
    else:
        partes = []
        if r["items"]:
            total = sum(_num(i["price"]) * i["qty"] for i in r["items"])
            lista = "; ".join(f"{i['qty']}x {i['name']}" for i in r["items"])
            total_txt = f"{total:.2f}".replace(".", ",")
            partes.append(("proposal", f"Entendi: {lista} — total R$ {total_txt}. Posso enviar o pedido?"))
        if r["ambiguous"]:
            partes.append(("options", "Qual destes você quer?"))
        if r["unknown"] and not r["items"] and not r["ambiguous"]:
            partes.append(("text", f"Não encontrei \"{', '.join(r['unknown'])}\" no cardápio. Tente outro nome ou toque em Ver cardápio."))
        elif r["unknown"]:
            partes.append(("text", f"Não encontrei: {', '.join(r['unknown'])}."))
        for tipo, txt in partes:
            if tipo == "proposal":
                _msg(chat, "bot", txt, proposal=r["items"])
            elif tipo == "options":
                _msg(chat, "bot", txt, options=r["ambiguous"])
            else:
                _msg(chat, "bot", txt)
        if not partes:
            _msg(chat, "bot", "Recebido! Se for um pedido, escreva o nome do produto e a quantidade.")
    return {"chat": _chat_publico(chat, desde)}


def chat_confirmar(estado: Dict, p: Dict) -> Dict:
    chat = _chat_req(estado, p.get("chatId"), p.get("token"))
    if chat["status"] != "aberto":
        raise ErroNegocio("Esta conversa foi encerrada.")
    desde = int(p.get("since") or 0)
    linhas = [{"itemId": i.get("itemId"), "qty": i.get("qty"), "notes": i.get("notes", "")} for i in (p.get("items") or [])[:20]]
    oid = f"PED-{secrets.randbelow(900000) + 100000}"
    base = _montar_pedido(estado, linhas, None, oid, publico=True)
    pct = _num((estado.get("settings") or {}).get("serviceFeePercent"), 10)
    taxa = round(base["subtotal"] * pct / 100, 2) if (estado.get("settings") or {}).get("enableServiceFeeByDefault") else 0.0
    agora = _agora()
    pedido = {"id": oid, "tableId": chat["table"], "customerName": chat["name"], "source": "Chat do cliente",
              "paymentMethod": "A cobrar na mesa", "paymentStatus": "pendente", "orderStatus": "recebido",
              "createdAt": agora.replace("T", " ")[:16], "ts": agora, "serviceFee": taxa,
              "total": round(base["subtotal"] + taxa, 2), "sellerId": "", "sellerName": "", "chatId": chat["id"], **base}
    estado["orders"].insert(0, pedido)
    chat["orderIds"].append(oid)
    mesa = next((t for t in estado.get("tables", []) if t.get("id") == chat["table"]), None)
    if mesa:
        mesa["status"] = "ocupada"
    total_txt = f"{pedido['total']:.2f}".replace(".", ",")
    _msg(chat, "bot", f"Pedido {oid} enviado! Total R$ {total_txt}. O atendente leva até a {chat['table']} e faz a cobrança.", orderId=oid)
    chat["unreadStaff"] = int(chat.get("unreadStaff", 0)) + 1
    return {"chat": _chat_publico(chat, desde)}


def chat_buscar(estado: Dict, p: Dict) -> Dict:
    chat = _chat_req(estado, p.get("chatId"), p.get("token"))
    return {"chat": _chat_publico(chat, int(p.get("since") or 0))}


def acao_chat_responder(estado: Dict, p: Dict, user: Dict) -> str:
    chat = next((c for c in estado.get("chats", []) if c.get("id") == p.get("chatId")), None)
    if not chat:
        raise ErroNegocio("Conversa não encontrada.")
    texto = _txt(p.get("text"), 400)
    if texto:
        _msg(chat, "atendente", texto, userName=user["name"])
    chat["unreadStaff"] = 0
    if p.get("close"):
        chat["status"] = "encerrado"
        _msg(chat, "bot", "Atendimento encerrado. Obrigado e volte sempre!")
        return "Conversa encerrada."
    return "Mensagem enviada." if texto else "Conversa marcada como lida."


# ---------------------------------------------------------------------------
# IAM: tablets / dispositivos
# ---------------------------------------------------------------------------
_presenca: Dict[str, Dict] = {}  # deviceId -> {lastSeen, view, userName, cart, ip}


def dispositivo_registrar(estado: Dict, p: Dict, ip: str) -> Dict:
    devices = estado["iam"]["devices"]
    pendentes = [d for d in devices if d.get("status") == "pendente"]
    if len(pendentes) >= 30:
        raise ErroNegocio("Há tablets demais aguardando liberação no IAM.")
    nome = _txt(p.get("name"), 40) or f"Tablet {len(devices) + 1:02d}"
    dev = {"id": _id("TAB"), "key": secrets.token_urlsafe(24), "name": nome, "status": "pendente", "mode": "mesa",
           "table": _mesa_do_texto(estado, p.get("table")) if p.get("table") else "", "blocked": False,
           "createdAt": _agora(), "registeredIp": ip}
    devices.append(dev)
    return {"deviceId": dev["id"], "key": dev["key"]}


def dispositivo_ping(estado: Dict, p: Dict, user: Optional[Dict], ip: str) -> Dict:
    dev = next((d for d in estado["iam"]["devices"] if d.get("id") == p.get("deviceId")), None)
    if not dev or dev.get("key") != p.get("key"):
        return {"ok": False, "status": "desconhecido"}
    _presenca[dev["id"]] = {
        "lastSeen": int(_time.time() * 1000), "view": _txt(p.get("view"), 20), "ip": ip,
        "userId": (user or {}).get("id", ""), "userName": (user or {}).get("name", ""),
        "table": _txt(p.get("table"), 40), "cart": int(_num(p.get("cart"))),
    }
    return {"ok": True, "status": dev["status"], "name": dev["name"], "mode": dev["mode"],
            "table": dev.get("table", ""), "blocked": bool(dev.get("blocked"))}


def presenca_dispositivos() -> Dict[str, Dict]:
    return dict(_presenca)


def acao_dispositivo_salvar(estado: Dict, p: Dict, user: Dict) -> str:
    dev = next((d for d in estado["iam"]["devices"] if d.get("id") == p.get("id")), None)
    if not dev:
        raise ErroNegocio("Tablet não encontrado.")
    dev["name"] = _txt(p.get("name"), 40) or dev["name"]
    dev["mode"] = p.get("mode") if p.get("mode") in ("mesa", "garcom", "caixa") else "mesa"
    dev["table"] = _txt(p.get("table"), 40)
    dev["blocked"] = bool(p.get("blocked"))
    if p.get("approve") or dev["status"] == "pendente" and p.get("status") == "ativo":
        dev["status"] = "ativo"
    return "Tablet atualizado."


def acao_dispositivo_excluir(estado: Dict, p: Dict, user: Dict) -> str:
    estado["iam"]["devices"] = [d for d in estado["iam"]["devices"] if d.get("id") != p.get("id")]
    _presenca.pop(p.get("id"), None)
    return "Tablet removido. Ele precisará ser configurado de novo."


# ---------------------------------------------------------------------------
# Registro das ações: nome -> (módulo, nível mínimo, função)
# ---------------------------------------------------------------------------
ACOES: Dict[str, Tuple[str, str, Callable]] = {
    "nota_salvar": ("recebimento", "use", acao_nota_salvar),
    "nota_excluir": ("recebimento", "use", acao_nota_excluir),
    "nota_analisar": ("aprovacoes", "use", acao_nota_analisar),
    "produto_salvar": ("estoque", "edit", acao_produto_salvar),
    "produto_excluir": ("estoque", "edit", acao_produto_excluir),
    "estoque_transferir": ("estoque", "use", acao_transferir),
    "estoque_ajustar": ("estoque", "edit", acao_ajustar),
    "preco_salvar": ("produtos", "edit", acao_preco_salvar),
    "venda_criar": ("vendas", "use", acao_venda_criar),
    "pedido_atualizar": ("vendas", "use", acao_pedido_atualizar),
    "chamado_resolver": ("vendas", "use", acao_chamado_resolver),
    "despesa_salvar": ("financeiro", "edit", acao_despesa_salvar),
    "despesa_excluir": ("financeiro", "edit", acao_despesa_excluir),
    "funcionario_salvar": ("financeiro", "edit", acao_funcionario_salvar),
    "funcionario_excluir": ("financeiro", "edit", acao_funcionario_excluir),
    "comissao_config": ("comissoes", "edit", acao_comissao_config),
    "pc_salvar": ("estoque", "edit", acao_pc_salvar),
    "item_disponibilidade": ("produtos", "use", acao_item_disponibilidade),
    "item_do_produto": ("produtos", "edit", acao_item_do_produto),
    "inv_iniciar": ("estoque", "edit", acao_inv_iniciar),
    "inv_contar": ("estoque", "use", acao_inv_contar),
    "inv_finalizar": ("estoque", "edit", acao_inv_finalizar),
    "inv_cancelar": ("estoque", "edit", acao_inv_cancelar),
    "tv_config": ("tv", "edit", acao_tv_config),
    "tv_chamar": ("tv", "use", acao_tv_chamar),
    "pc_status": ("estoque", "edit", acao_pc_status),
    "pc_excluir": ("estoque", "edit", acao_pc_excluir),
    "chat_responder": ("vendas", "use", acao_chat_responder),
    "dispositivo_salvar": ("usuarios", "edit", acao_dispositivo_salvar),
    "dispositivo_excluir": ("usuarios", "edit", acao_dispositivo_excluir),
}


def executar(estado: Dict, nome: str, payload: Dict, user: Dict) -> str:
    if nome not in ACOES:
        raise ErroNegocio("Ação desconhecida.")
    modulo, minimo, funcao = ACOES[nome]
    if not auth.pode(user, modulo, minimo):
        raise PermissionError("Seu perfil não tem permissão para esta ação.")
    garantir_erp(estado)
    return funcao(estado, payload or {}, user)


# ---------------------------------------------------------------------------
# O que cada usuário pode receber do estado
# ---------------------------------------------------------------------------
def estado_para_usuario(estado: Dict, user: Dict) -> Dict:
    e = copy.deepcopy(estado)
    marcar_esgotados(e)
    for c in e.get("chats", []) or []:
        c.pop("token", None)
    for d in (e.get("iam") or {}).get("devices", []) or []:
        d.pop("key", None)
    if user.get("isAdmin"):
        return e
    pode = lambda m, n="view": auth.pode(user, m, n)  # noqa: E731

    cfg = e.get("settings", {})
    cfg.pop("adminPin", None)
    if not pode("redes", "edit"):
        ig = cfg.get("instagramConfig") or {}
        for k in ("accessToken", "igUserId", "webhookUrl"):
            ig.pop(k, None)
    if not pode("site", "edit"):
        (e.get("home") or {}).pop("facebookConfig", None)

    ve_custos = any(pode(m) for m in ("produtos", "estoque", "financeiro", "aprovacoes"))
    if not ve_custos:
        for it in e.get("menuItems", []):
            it.pop("costPrice", None)

    if not pode("financeiro"):
        e["fixedExpenses"], e["employees"], e["purchases"] = [], [], []
        e["historicalRevenueAdjustment"] = {}

    erp = e.get("erp") or {}
    if not (pode("estoque") or pode("recebimento") or pode("aprovacoes") or pode("produtos")):
        erp["products"] = [{"id": p["id"], "name": p["name"]} for p in erp.get("products", [])]
    if not (pode("recebimento") or pode("aprovacoes") or pode("financeiro")):
        erp["receipts"] = []
    if not pode("estoque"):
        erp["movements"] = []
    if not pode("estoque"):
        erp["inventories"] = []
    if not pode("tv"):
        e["tv"] = {}
    if not (pode("estoque") or pode("recebimento") or pode("aprovacoes") or pode("financeiro")):
        erp["purchaseOrders"] = []
        erp["suppliers"] = {}

    if pode("vendas", "edit") or pode("comissoes") or pode("financeiro") or pode("tv") or pode("vendas", "view") and not pode("vendas", "use"):
        pass  # vê todos os pedidos
    elif pode("vendas", "use"):
        e["orders"] = [o for o in e.get("orders", [])
                       if o.get("sellerId") == user["id"] or (not o.get("sellerId") and o.get("paymentStatus") != "pago")]
    else:
        e["orders"] = []
    if not pode("vendas", "use"):
        e["waiterCalls"] = []
        e["chats"] = []
    if not pode("usuarios"):
        e["iam"] = {"devices": []}
    if not ve_custos:
        for o in e.get("orders", []):
            o.pop("costTotal", None)
            for ln in o.get("items", []):
                ln.pop("costPrice", None)
    return e


def mesclar_estado_do_cliente(estado: Dict, cliente: Dict, user: Dict) -> List[str]:
    """Aplica do estado enviado pelo navegador apenas as partes que o usuário pode editar
    (site, redes, mesas, configurações). Estoque, vendas e financeiro só mudam por ações."""
    aplicadas = []
    pode = lambda m: auth.pode(user, m, "edit")  # noqa: E731
    if pode("config") and isinstance(cliente.get("settings"), dict):
        novo = dict(cliente["settings"])
        antigo = estado.get("settings", {})
        if not pode("redes"):
            novo["instagramConfig"] = antigo.get("instagramConfig", {})
            novo["instagram"] = antigo.get("instagram", novo.get("instagram"))
        novo.setdefault("adminPin", antigo.get("adminPin"))
        estado["settings"] = novo
        aplicadas.append("settings")
    elif pode("redes") and isinstance(cliente.get("settings"), dict):
        estado.setdefault("settings", {})["instagramConfig"] = cliente["settings"].get("instagramConfig", {})
        estado["settings"]["instagram"] = cliente["settings"].get("instagram", estado["settings"].get("instagram"))
        aplicadas.append("settings.instagram")
    if pode("site"):
        if isinstance(cliente.get("home"), dict):
            home = dict(cliente["home"])
            if "facebookConfig" not in home:
                home["facebookConfig"] = (estado.get("home") or {}).get("facebookConfig", {})
            estado["home"] = home
            aplicadas.append("home")
        if isinstance(cliente.get("categories"), list):
            estado["categories"] = cliente["categories"]
            aplicadas.append("categories")
        if isinstance(cliente.get("menuItems"), list):
            antigos = {i.get("id"): i for i in estado.get("menuItems", [])}
            novos = []
            for it in cliente["menuItems"]:
                if not isinstance(it, dict):
                    continue
                anterior = antigos.get(it.get("id"), {})
                # Ficha técnica, custo e margem pertencem ao módulo Produtos & Preços
                for chave in ("composition", "targetMarkup", "extraCost", "costPrice", "available"):
                    if chave in anterior:
                        it[chave] = anterior[chave]
                novos.append(it)
            estado["menuItems"] = novos
            aplicadas.append("menuItems")
    if pode("redes") and isinstance(cliente.get("socialPosts"), list):
        estado["socialPosts"] = cliente["socialPosts"]
        aplicadas.append("socialPosts")
    if pode("mesas") and isinstance(cliente.get("tables"), list):
        estado["tables"] = cliente["tables"]
        aplicadas.append("tables")
    return aplicadas

# -*- coding: utf-8 -*-
"""
Armazenamento do Imperador Lounge Bar.

- Com a variável DATABASE_URL (Railway / PostgreSQL): cada parte do sistema fica
  na sua própria tabela (pedidos, itens do pedido, produtos, movimentações,
  notas, pedidos de compra, inventários, usuários, perfis, tablets, chats...).
  Cada tabela tem colunas pesquisáveis + o registro completo em JSONB.
- Sem DATABASE_URL (uso local): SQLite em data/imperador_lounge.db, como antes,
  com cópia de segurança diária em data/backups/.

A aplicação continua trabalhando com um "estado" em memória; aqui ele é
carregado das tabelas e, a cada gravação, só as linhas que mudaram são
escritas (upsert), dentro de uma transação.
"""

import copy
import hashlib
import json
import os
import shutil
import sqlite3
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SQLITE_PATH = DATA_DIR / "imperador_lounge.db"
JSON_PATH = DATA_DIR / "db.json"
AUTH_FILE = DATA_DIR / "admin_auth.json"
UPLOADS_DIR = BASE_DIR / "public" / "uploads"
BACKUP_DIR = DATA_DIR / "backups"

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
USANDO_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))

_lock = threading.RLock()


# ===========================================================================
# Utilidades de conversão para as colunas
# ===========================================================================
def _num(v) -> Optional[float]:
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def _ts(v) -> Optional[datetime]:
    if not v:
        return None
    s = str(v).strip().replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:26], fmt)
        except ValueError:
            continue
    return None


def _dt(v) -> Optional[date]:
    t = _ts(v)
    return t.date() if t else None


def _b(v) -> bool:
    return bool(v)


def _txt(v) -> Optional[str]:
    return None if v is None else str(v)


def g(chave: str, conv: Callable = _txt, padrao=None) -> Callable:
    def f(row):
        cur: Any = row
        for parte in chave.split("."):
            cur = cur.get(parte) if isinstance(cur, dict) else None
        return conv(cur) if cur is not None else padrao
    return f


# ===========================================================================
# Mapa estado -> tabelas
#   caminho: onde a lista fica no estado ("orders", "erp.products"...)
#   ordem:   "pos"  = a ordem da lista importa (posição gravada)
#            "seq"  = registros novos no começo da lista (mais recentes primeiro)
#   arquivo: True = registros que saem da lista continuam no banco (histórico)
#   limite:  quantos registros carregar para a memória (os mais recentes)
# ===========================================================================
COLECOES: List[Dict[str, Any]] = [
    {"caminho": "categories", "tabela": "categories", "ordem": "pos", "colunas": [
        ("name", "TEXT", g("name")), ("icon", "TEXT", g("icon")), ("display_order", "INTEGER", g("order", lambda v: int(_num(v) or 0))),
        ("hidden_on_site", "BOOLEAN", g("hiddenOnSite", _b, False))]},
    {"caminho": "menuItems", "tabela": "menu_items", "ordem": "pos", "colunas": [
        ("category_id", "TEXT", g("categoryId")), ("name", "TEXT", g("name")), ("price", "NUMERIC(12,2)", g("price", _num)),
        ("cost_price", "NUMERIC(12,2)", g("costPrice", _num)), ("target_markup", "NUMERIC(8,2)", g("targetMarkup", _num)),
        ("available", "BOOLEAN", lambda r: r.get("available") is not False), ("badge", "TEXT", g("badge")), ("image", "TEXT", g("image"))],
     "filhos": {"tabela": "menu_item_composition", "lista": "composition", "colunas": [
        ("product_id", "TEXT", g("productId")), ("qty", "NUMERIC(14,4)", g("qty", _num)), ("source", "TEXT", g("from"))]}},
    {"caminho": "tables", "tabela": "dining_tables", "ordem": "pos", "colunas": [
        ("name", "TEXT", g("name")), ("area", "TEXT", g("area")), ("capacity", "INTEGER", g("capacity", lambda v: int(_num(v) or 0))),
        ("status", "TEXT", g("status"))]},
    {"caminho": "socialPosts", "tabela": "social_posts", "ordem": "pos", "colunas": [
        ("title", "TEXT", g("title")), ("post_type", "TEXT", g("postType")), ("image_url", "TEXT", g("imageUrl")),
        ("ig_status", "TEXT", g("igStatus"))]},
    {"caminho": "orders", "tabela": "orders", "ordem": "seq", "colunas": [
        ("created_at", "TIMESTAMP", lambda r: _ts(r.get("ts") or r.get("createdAt"))), ("table_id", "TEXT", g("tableId")),
        ("customer_name", "TEXT", g("customerName")), ("source", "TEXT", g("source")), ("seller_id", "TEXT", g("sellerId")),
        ("seller_name", "TEXT", g("sellerName")), ("payment_method", "TEXT", g("paymentMethod")),
        ("payment_status", "TEXT", g("paymentStatus")), ("order_status", "TEXT", g("orderStatus")),
        ("subtotal", "NUMERIC(12,2)", g("subtotal", _num)), ("service_fee", "NUMERIC(12,2)", g("serviceFee", _num)),
        ("total", "NUMERIC(12,2)", g("total", _num)), ("cost_total", "NUMERIC(12,2)", g("costTotal", _num)),
        ("chat_id", "TEXT", g("chatId")), ("client_ref", "TEXT", g("clientRef"))],
     "indices": ["created_at", "seller_id", "payment_status", "table_id"],
     "filhos": {"tabela": "order_items", "lista": "items", "colunas": [
        ("item_id", "TEXT", g("itemId")), ("name", "TEXT", g("name")), ("qty", "NUMERIC(12,3)", g("qty", _num)),
        ("price", "NUMERIC(12,2)", g("price", _num)), ("cost_price", "NUMERIC(12,2)", g("costPrice", _num)), ("notes", "TEXT", g("notes"))]}},
    {"caminho": "waiterCalls", "tabela": "waiter_calls", "ordem": "seq", "limite": 500, "arquivo": True, "colunas": [
        ("table_id", "TEXT", g("tableId")), ("call_type", "TEXT", g("type")), ("status", "TEXT", g("status")),
        ("message", "TEXT", g("message")), ("created_label", "TEXT", g("createdAt"))]},
    {"caminho": "chats", "tabela": "chats", "ordem": "seq", "colunas": [
        ("table_id", "TEXT", g("table")), ("customer_name", "TEXT", g("name")), ("status", "TEXT", g("status")),
        ("created_at", "TIMESTAMP", g("createdAt", _ts)), ("updated_at", "TIMESTAMP", g("updatedAt", _ts)),
        ("unread_staff", "INTEGER", g("unreadStaff", lambda v: int(_num(v) or 0)))]},
    {"caminho": "purchases", "tabela": "legacy_purchases", "ordem": "pos", "colunas": [
        ("supplier", "TEXT", g("supplier")), ("total", "NUMERIC(12,2)", g("total", _num))]},
    {"caminho": "fixedExpenses", "tabela": "fixed_expenses", "ordem": "pos", "colunas": [
        ("name", "TEXT", g("name")), ("category", "TEXT", g("category")), ("due_date", "TEXT", g("dueDate")),
        ("amount", "NUMERIC(12,2)", g("amount", _num)), ("status", "TEXT", g("status"))]},
    {"caminho": "employees", "tabela": "employees", "ordem": "pos", "colunas": [
        ("name", "TEXT", g("name")), ("role", "TEXT", g("role")), ("base_salary", "NUMERIC(12,2)", g("baseSalary", _num)),
        ("bonuses", "NUMERIC(12,2)", g("bonuses", _num)), ("advances", "NUMERIC(12,2)", g("advances", _num)),
        ("status", "TEXT", g("status")), ("user_id", "TEXT", g("userId"))]},
    {"caminho": "erp.products", "tabela": "products", "ordem": "pos", "colunas": [
        ("name", "TEXT", g("name")), ("category", "TEXT", g("category")), ("unit", "TEXT", g("unit")),
        ("content", "NUMERIC(14,4)", g("content", _num)), ("content_unit", "TEXT", g("contentUnit")),
        ("stock_deposito", "NUMERIC(14,4)", g("stock.deposito", _num, 0)), ("stock_bar", "NUMERIC(14,4)", g("stock.bar", _num, 0)),
        ("stock_uso", "NUMERIC(14,4)", g("stock.uso", _num, 0)), ("avg_cost", "NUMERIC(14,4)", g("avgCost", _num)),
        ("last_cost", "NUMERIC(14,4)", g("lastCost", _num)), ("min_stock", "NUMERIC(14,4)", g("minStock", _num)),
        ("supplier", "TEXT", g("supplier")), ("active", "BOOLEAN", lambda r: r.get("active") is not False)]},
    {"caminho": "erp.movements", "tabela": "stock_movements", "ordem": "seq", "limite": 3000, "arquivo": True, "colunas": [
        ("created_at", "TIMESTAMP", g("at", _ts)), ("movement_type", "TEXT", g("type")), ("product_id", "TEXT", g("productId")),
        ("product_name", "TEXT", g("productName")), ("qty", "NUMERIC(14,4)", g("qty", _num)), ("unit", "TEXT", g("unit")),
        ("from_location", "TEXT", g("from")), ("to_location", "TEXT", g("to")), ("cost", "NUMERIC(12,2)", g("cost", _num)),
        ("reference", "TEXT", g("ref")), ("user_id", "TEXT", g("userId")), ("user_name", "TEXT", g("userName"))],
     "indices": ["created_at", "product_id", "movement_type"]},
    {"caminho": "erp.receipts", "tabela": "receipts", "ordem": "seq", "colunas": [
        ("number", "TEXT", g("number")), ("supplier", "TEXT", g("supplier")), ("status", "TEXT", g("status")),
        ("note_value", "NUMERIC(12,2)", g("noteValue", _num)), ("items_total", "NUMERIC(12,2)", g("itemsTotal", _num)),
        ("received_date", "DATE", g("receivedDate", _dt)), ("purchase_order_id", "TEXT", g("purchaseOrderId")),
        ("created_at", "TIMESTAMP", g("createdAt", _ts)), ("created_by", "TEXT", g("createdByName")),
        ("reviewed_at", "TIMESTAMP", g("reviewedAt", _ts)), ("reviewed_by", "TEXT", g("reviewedByName"))],
     "filhos": {"tabela": "receipt_items", "lista": "items", "colunas": [
        ("product_id", "TEXT", g("productId")), ("name", "TEXT", g("name")), ("note_qty", "NUMERIC(14,4)", g("noteQty", _num)),
        ("received_qty", "NUMERIC(14,4)", g("receivedQty", _num)), ("unit_cost", "NUMERIC(14,4)", g("unitCost", _num)),
        ("total", "NUMERIC(12,2)", g("total", _num)), ("lot", "TEXT", g("lot")), ("expiry", "TEXT", g("expiry"))]}},
    {"caminho": "erp.purchaseOrders", "tabela": "purchase_orders", "ordem": "seq", "colunas": [
        ("number", "TEXT", g("number")), ("supplier", "TEXT", g("supplier")), ("status", "TEXT", g("status")),
        ("total", "NUMERIC(12,2)", g("total", _num)), ("expected_date", "DATE", g("expectedDate", _dt)),
        ("created_at", "TIMESTAMP", g("createdAt", _ts)), ("sent_at", "TIMESTAMP", g("sentAt", _ts)),
        ("received_at", "TIMESTAMP", g("receivedAt", _ts)), ("receipt_id", "TEXT", g("receiptId"))],
     "filhos": {"tabela": "purchase_order_items", "lista": "items", "colunas": [
        ("product_id", "TEXT", g("productId")), ("name", "TEXT", g("name")), ("unit", "TEXT", g("unit")),
        ("qty", "NUMERIC(14,4)", g("qty", _num)), ("unit_cost", "NUMERIC(14,4)", g("unitCost", _num)), ("total", "NUMERIC(12,2)", g("total", _num))]}},
    {"caminho": "erp.inventories", "tabela": "inventories", "ordem": "seq", "colunas": [
        ("number", "TEXT", g("number")), ("status", "TEXT", g("status")), ("created_at", "TIMESTAMP", g("createdAt", _ts)),
        ("finished_at", "TIMESTAMP", g("finishedAt", _ts)), ("adjustments", "INTEGER", g("adjustments", lambda v: int(_num(v) or 0))),
        ("value_diff", "NUMERIC(12,2)", g("valueDiff", _num))],
     "filhos": {"tabela": "inventory_items", "lista": "items", "colunas": [
        ("product_id", "TEXT", g("productId")), ("name", "TEXT", g("name")),
        ("system_deposito", "NUMERIC(14,4)", g("system.deposito", _num)), ("system_bar", "NUMERIC(14,4)", g("system.bar", _num)),
        ("system_uso", "NUMERIC(14,4)", g("system.uso", _num)), ("counted_deposito", "NUMERIC(14,4)", g("counted.deposito", _num)),
        ("counted_bar", "NUMERIC(14,4)", g("counted.bar", _num)), ("counted_uso", "NUMERIC(14,4)", g("counted.uso", _num)),
        ("avg_cost", "NUMERIC(14,4)", g("avgCost", _num))]}},
    {"caminho": "iam.devices", "tabela": "devices", "ordem": "pos", "colunas": [
        ("name", "TEXT", g("name")), ("status", "TEXT", g("status")), ("mode", "TEXT", g("mode")),
        ("table_id", "TEXT", g("table")), ("blocked", "BOOLEAN", g("blocked", _b, False)), ("created_at", "TIMESTAMP", g("createdAt", _ts))]},
]

# Partes únicas (objetos) do estado -> tabela app_config (chave/valor JSONB)
UNICOS = ["settings", "home", "tv", "historicalRevenueAdjustment", "erp.suppliers"]


def _ler_caminho(estado: Dict, caminho: str):
    cur: Any = estado
    for parte in caminho.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(parte)
    return cur


def _gravar_caminho(estado: Dict, caminho: str, valor) -> None:
    partes = caminho.split(".")
    cur = estado
    for parte in partes[:-1]:
        cur = cur.setdefault(parte, {})
    cur[partes[-1]] = valor


def _hash(obj) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def _todos_os_caminhos() -> set:
    return {c["caminho"] for c in COLECOES} | set(UNICOS)


# ===========================================================================
# Backend PostgreSQL
# ===========================================================================
class PostgresStore:
    def __init__(self, url: str):
        import psycopg2  # noqa: F401  (importado só quando usar Postgres)
        import psycopg2.extras  # noqa: F401
        self.url = url
        self.conn = None
        self.cache_json: Optional[str] = None
        self.hashes: Dict[str, Dict[str, str]] = {}
        self.seq: Dict[str, int] = {}
        self.seq_ids: Dict[str, Dict[str, int]] = {}
        self.unicos_hash: Dict[str, str] = {}
        self.auth_cache: Optional[Dict] = None

    # ------------------------------------------------------------ conexão
    def _conectar(self):
        import psycopg2
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.url, connect_timeout=10)
            self.conn.autocommit = False
        return self.conn

    def _executar(self, fn):
        """Executa fn(cursor) numa transação, reconectando uma vez se a conexão caiu."""
        import psycopg2
        for tentativa in range(2):
            conn = self._conectar()
            try:
                with conn.cursor() as cur:
                    resultado = fn(cur)
                conn.commit()
                return resultado
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                try:
                    conn.close()
                except Exception:
                    pass
                self.conn = None
                if tentativa:
                    raise
            except Exception:
                conn.rollback()
                raise

    # ------------------------------------------------------------ esquema
    def criar_esquema(self) -> None:
        def ddl(cur):
            cur.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
            cur.execute("""CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
            for c in COLECOES:
                cols = ",\n".join(f"  {nome} {tipo}" for nome, tipo, _ in c["colunas"])
                cur.execute(f"""CREATE TABLE IF NOT EXISTS {c['tabela']} (
                  id TEXT PRIMARY KEY,
{cols},
                  sort_key BIGINT NOT NULL DEFAULT 0,
                  data JSONB NOT NULL,
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
                cur.execute(f"CREATE INDEX IF NOT EXISTS ix_{c['tabela']}_sort ON {c['tabela']} (sort_key)")
                for idx in c.get("indices", []):
                    cur.execute(f"CREATE INDEX IF NOT EXISTS ix_{c['tabela']}_{idx} ON {c['tabela']} ({idx})")
                f = c.get("filhos")
                if f:
                    fcols = ",\n".join(f"  {nome} {tipo}" for nome, tipo, _ in f["colunas"])
                    cur.execute(f"""CREATE TABLE IF NOT EXISTS {f['tabela']} (
                      id BIGSERIAL PRIMARY KEY,
                      parent_id TEXT NOT NULL REFERENCES {c['tabela']}(id) ON DELETE CASCADE,
                      line_no INTEGER NOT NULL,
{fcols},
                      data JSONB NOT NULL)""")
                    cur.execute(f"CREATE INDEX IF NOT EXISTS ix_{f['tabela']}_parent ON {f['tabela']} (parent_id)")
            cur.execute("""CREATE TABLE IF NOT EXISTS admin_roles (
                key TEXT PRIMARY KEY, label TEXT NOT NULL, permissions JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
            cur.execute("""CREATE TABLE IF NOT EXISTS admin_users (
                id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT, role TEXT NOT NULL,
                permissions JSONB NOT NULL, commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
                active BOOLEAN NOT NULL DEFAULT TRUE, must_change BOOLEAN NOT NULL DEFAULT FALSE,
                password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
            cur.execute("""CREATE TABLE IF NOT EXISTS media (
                name TEXT PRIMARY KEY, mime TEXT NOT NULL, content BYTEA NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
            cur.execute("INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING")
        self._executar(ddl)

    # ------------------------------------------------------------ estado
    def carregar(self) -> Optional[Dict]:
        with _lock:
            if self.cache_json is not None:
                return json.loads(self.cache_json)

            def ler(cur):
                cur.execute("SELECT key, data FROM app_config")
                config = {k: v for k, v in cur.fetchall()}
                if "settings" not in config:
                    return None
                estado: Dict[str, Any] = {}
                for chave, valor in config.items():
                    if chave.startswith("extra:"):
                        _gravar_caminho(estado, chave[6:], valor)
                    elif chave in UNICOS:
                        _gravar_caminho(estado, chave, valor)
                for c in COLECOES:
                    ordem = "DESC" if c["ordem"] == "seq" else "ASC"
                    limite = f" LIMIT {int(c['limite'])}" if c.get("limite") else ""
                    cur.execute(f"SELECT id, sort_key, data FROM {c['tabela']} ORDER BY sort_key {ordem}{limite}")
                    linhas = cur.fetchall()
                    _gravar_caminho(estado, c["caminho"], [d for _, _, d in linhas])
                    self.seq_ids[c["tabela"]] = {i: sk for i, sk, _ in linhas}
                    cur.execute(f"SELECT COALESCE(MAX(sort_key), 0) FROM {c['tabela']}")
                    self.seq[c["tabela"]] = int(cur.fetchone()[0])
                    self.hashes[c["tabela"]] = {}
                    for idx, (i, _, d) in enumerate(linhas):
                        self.hashes[c["tabela"]][i] = _hash(d) + (f":{idx}" if c["ordem"] == "pos" else "")
                for chave in UNICOS:
                    self.unicos_hash[chave] = _hash(_ler_caminho(estado, chave))
                return estado

            estado = self._executar(ler)
            if estado is not None:
                self.cache_json = json.dumps(estado, ensure_ascii=False)
            return estado

    def salvar(self, estado: Dict) -> bool:
        from psycopg2.extras import Json
        with _lock:
            novos_hashes: Dict[str, Dict[str, str]] = {}
            novos_seq = dict(self.seq)
            novos_seq_ids = {k: dict(v) for k, v in self.seq_ids.items()}

            def gravar(cur):
                # Partes únicas (configurações, site, TV...) e chaves desconhecidas
                for chave in UNICOS:
                    valor = _ler_caminho(estado, chave)
                    h = _hash(valor)
                    if valor is not None and self.unicos_hash.get(chave) != h:
                        cur.execute("""INSERT INTO app_config (key, data, updated_at) VALUES (%s, %s, now())
                                       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()""", (chave, Json(valor)))
                        self.unicos_hash[chave] = h
                conhecidos = _todos_os_caminhos()
                extras = {}
                for k, v in estado.items():
                    if k == "erp" and isinstance(v, dict):
                        for k2, v2 in v.items():
                            if f"erp.{k2}" not in conhecidos:
                                extras[f"erp.{k2}"] = v2
                    elif k == "iam" and isinstance(v, dict):
                        for k2, v2 in v.items():
                            if f"iam.{k2}" not in conhecidos:
                                extras[f"iam.{k2}"] = v2
                    elif k not in conhecidos and k not in ("erp", "iam"):
                        extras[k] = v
                for k, v in extras.items():
                    h = _hash(v)
                    if self.unicos_hash.get("extra:" + k) != h:
                        cur.execute("""INSERT INTO app_config (key, data, updated_at) VALUES (%s, %s, now())
                                       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()""", ("extra:" + k, Json(v)))
                        self.unicos_hash["extra:" + k] = h

                # Coleções (uma tabela cada)
                for c in COLECOES:
                    tabela = c["tabela"]
                    lista = _ler_caminho(estado, c["caminho"]) or []
                    antigos = self.hashes.get(tabela, {})
                    atuais: Dict[str, str] = {}
                    ids_seq = novos_seq_ids.setdefault(tabela, {})
                    total = len(lista)
                    base = novos_seq.get(tabela, 0)
                    houve_novo = False
                    for idx, row in enumerate(lista):
                        if not isinstance(row, dict):
                            continue
                        if not row.get("id"):
                            row["id"] = f"{tabela}-{hashlib.sha1(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()[:12]}"
                        rid = str(row["id"])
                        if rid in atuais:
                            continue  # id repetido na lista: mantém o primeiro
                        h = _hash(row) + (f":{idx}" if c["ordem"] == "pos" else "")
                        atuais[rid] = h
                        if antigos.get(rid) == h:
                            continue
                        if c["ordem"] == "pos":
                            sk = idx
                        elif rid in ids_seq:
                            sk = ids_seq[rid]
                        else:
                            # mais recentes ficam no começo da lista -> recebem as maiores chaves
                            sk = base + (total - idx)
                            ids_seq[rid] = sk
                            houve_novo = True
                        valores = [fn(row) for _, _, fn in c["colunas"]]
                        nomes = [n for n, _, _ in c["colunas"]]
                        cur.execute(
                            f"""INSERT INTO {tabela} (id, {', '.join(nomes)}, sort_key, data, updated_at)
                                VALUES (%s, {', '.join(['%s'] * len(nomes))}, %s, %s, now())
                                ON CONFLICT (id) DO UPDATE SET {', '.join(f'{n} = EXCLUDED.{n}' for n in nomes)},
                                  sort_key = EXCLUDED.sort_key, data = EXCLUDED.data, updated_at = now()""",
                            [rid, *valores, sk, Json(row)])
                        f = c.get("filhos")
                        if f:
                            cur.execute(f"DELETE FROM {f['tabela']} WHERE parent_id = %s", (rid,))
                            fnomes = [n for n, _, _ in f["colunas"]]
                            for n_linha, filho in enumerate(row.get(f["lista"]) or []):
                                if not isinstance(filho, dict):
                                    continue
                                cur.execute(
                                    f"""INSERT INTO {f['tabela']} (parent_id, line_no, {', '.join(fnomes)}, data)
                                        VALUES (%s, %s, {', '.join(['%s'] * len(fnomes))}, %s)""",
                                    [rid, n_linha, *[fn(filho) for _, _, fn in f["colunas"]], Json(filho)])
                    if houve_novo:
                        novos_seq[tabela] = base + total
                    if not c.get("arquivo"):
                        removidos = [i for i in antigos if i not in atuais]
                        if removidos:
                            cur.execute(f"DELETE FROM {tabela} WHERE id = ANY(%s)", (removidos,))
                            for i in removidos:
                                ids_seq.pop(i, None)
                    novos_hashes[tabela] = atuais if not c.get("arquivo") else {**antigos, **atuais}

            try:
                self._executar(gravar)
            except Exception as exc:
                print(f"[ERRO] Falha ao gravar no PostgreSQL: {exc}")
                # força recarregar do banco na próxima leitura (memória pode estar adiantada)
                self.cache_json = None
                self.hashes, self.unicos_hash = {}, {}
                return False
            self.hashes.update(novos_hashes)
            self.seq, self.seq_ids = novos_seq, novos_seq_ids
            self.cache_json = json.dumps(estado, ensure_ascii=False)
            return True

    # ------------------------------------------------------------ usuários
    def auth_carregar(self) -> Optional[Dict]:
        with _lock:
            if self.auth_cache is not None:
                return copy.deepcopy(self.auth_cache)

            def ler(cur):
                cur.execute("""SELECT id, username, name, role, permissions, commission_percent, active, must_change,
                                      password_salt, password_hash, created_at FROM admin_users ORDER BY created_at NULLS FIRST, username""")
                users = [{"id": r[0], "username": r[1], "name": r[2], "role": r[3], "permissions": r[4],
                          "commissionPercent": float(r[5] or 0), "active": r[6], "mustChange": r[7],
                          "salt": r[8], "hash": r[9], "createdAt": r[10] or ""} for r in cur.fetchall()]
                cur.execute("SELECT key, label, permissions FROM admin_roles")
                roles = {k: {"label": l, "permissions": p} for k, l, p in cur.fetchall()}
                return {"users": users, "roles": roles} if users else None

            dados = self._executar(ler)
            if dados is not None:
                self.auth_cache = copy.deepcopy(dados)
            return dados

    def auth_salvar(self, dados: Dict) -> None:
        from psycopg2.extras import Json
        with _lock:
            def gravar(cur):
                ids = []
                for u in dados.get("users", []):
                    ids.append(u["id"])
                    cur.execute("""INSERT INTO admin_users (id, username, name, role, permissions, commission_percent, active,
                                      must_change, password_salt, password_hash, created_at, updated_at)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                                   ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, name=EXCLUDED.name, role=EXCLUDED.role,
                                     permissions=EXCLUDED.permissions, commission_percent=EXCLUDED.commission_percent,
                                     active=EXCLUDED.active, must_change=EXCLUDED.must_change, password_salt=EXCLUDED.password_salt,
                                     password_hash=EXCLUDED.password_hash, updated_at=now()""",
                                (u["id"], u["username"], u.get("name"), u.get("role", "vendedor"), Json(u.get("permissions") or {}),
                                 float(u.get("commissionPercent") or 0), bool(u.get("active", True)), bool(u.get("mustChange")),
                                 u["salt"], u["hash"], u.get("createdAt")))
                cur.execute("DELETE FROM admin_users WHERE NOT (id = ANY(%s))", (ids,))
                chaves = list((dados.get("roles") or {}).keys())
                for k, r in (dados.get("roles") or {}).items():
                    cur.execute("""INSERT INTO admin_roles (key, label, permissions, updated_at) VALUES (%s,%s,%s, now())
                                   ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, permissions=EXCLUDED.permissions, updated_at=now()""",
                                (k, r.get("label") or k, Json(r.get("permissions") or {})))
                cur.execute("DELETE FROM admin_roles WHERE NOT (key = ANY(%s))", (chaves,))
            self._executar(gravar)
            self.auth_cache = copy.deepcopy(dados)

    # ------------------------------------------------------------ imagens
    def media_gravar(self, nome: str, mime: str, conteudo: bytes) -> None:
        import psycopg2
        self._executar(lambda cur: cur.execute(
            "INSERT INTO media (name, mime, content) VALUES (%s,%s,%s) ON CONFLICT (name) DO UPDATE SET mime=EXCLUDED.mime, content=EXCLUDED.content",
            (nome, mime, psycopg2.Binary(conteudo))))

    def media_ler(self, nome: str) -> Optional[Tuple[bytes, str]]:
        def ler(cur):
            cur.execute("SELECT content, mime FROM media WHERE name = %s", (nome,))
            r = cur.fetchone()
            return (bytes(r[0]), r[1]) if r else None
        return self._executar(ler)


# ===========================================================================
# Backend SQLite (uso local)
# ===========================================================================
class SQLiteStore:
    def criar_esquema(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(SQLITE_PATH) as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS system_state (
                id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")

    def carregar(self) -> Optional[Dict]:
        try:
            with sqlite3.connect(SQLITE_PATH) as conn:
                row = conn.execute("SELECT state_json FROM system_state WHERE id = 1").fetchone()
                if row and row[0]:
                    return json.loads(row[0])
        except Exception as exc:
            print(f"[AVISO] Erro ao ler SQLite: {exc}")
        if JSON_PATH.exists():
            try:
                return json.loads(JSON_PATH.read_text(encoding="utf-8"))
            except Exception:
                pass
        return None

    def _backup_diario(self) -> None:
        """Copia o banco uma vez por dia para data/backups (mantém os últimos 30 dias)."""
        try:
            if not SQLITE_PATH.exists():
                return
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            destino = BACKUP_DIR / f"imperador-{date.today().isoformat()}.db"
            if not destino.exists():
                shutil.copy2(SQLITE_PATH, destino)
                for antigo in sorted(BACKUP_DIR.glob("imperador-*.db"))[:-30]:
                    antigo.unlink(missing_ok=True)
        except Exception as exc:
            print(f"[AVISO] Backup diário não realizado: {exc}")

    def salvar(self, estado: Dict) -> bool:
        with _lock:
            try:
                self._backup_diario()
                texto = json.dumps(estado, ensure_ascii=False)
                with sqlite3.connect(SQLITE_PATH) as conn:
                    conn.execute("""INSERT INTO system_state (id, state_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
                                    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP""", (texto,))
                tmp = JSON_PATH.with_suffix(".tmp")
                tmp.write_text(texto, encoding="utf-8")
                tmp.replace(JSON_PATH)
                return True
            except Exception as exc:
                print(f"[ERRO] Falha ao salvar estado no SQLite: {exc}")
                return False

    def auth_carregar(self) -> Optional[Dict]:
        if not AUTH_FILE.exists():
            return None
        return json.loads(AUTH_FILE.read_text(encoding="utf-8"))

    def auth_salvar(self, dados: Dict) -> None:
        AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = AUTH_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(AUTH_FILE)

    def media_gravar(self, nome: str, mime: str, conteudo: bytes) -> None:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOADS_DIR / nome).write_bytes(conteudo)

    def media_ler(self, nome: str) -> Optional[Tuple[bytes, str]]:
        return None  # servido direto da pasta public/uploads


_store = None


def store():
    global _store
    if _store is None:
        _store = PostgresStore(DATABASE_URL) if USANDO_POSTGRES else SQLiteStore()
        _store.criar_esquema()
    return _store


def descricao() -> str:
    return "PostgreSQL" if USANDO_POSTGRES else "SQLite (local)"

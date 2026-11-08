# -*- coding: utf-8 -*-
"""
Cria as tabelas do Imperador Lounge Bar no PostgreSQL (Railway).

Uso:
    # 1) Só gerar o arquivo schema.sql (para colar no console do banco do Railway)
    python criar_tabelas.py --sql

    # 2) Criar as tabelas direto no banco (usa a variável DATABASE_URL ou --url)
    python criar_tabelas.py --url "postgresql://usuario:senha@host:porta/banco"

    # 3) Criar as tabelas e levar os dados deste computador para o banco
    #    (cardápio, pedidos, estoque, usuários e fotos)
    python criar_tabelas.py --url "..." --importar

    # 4) Criar as tabelas e gravar o cardápio inicial de exemplo (banco vazio)
    python criar_tabelas.py --url "..." --dados-iniciais

No Railway, use a URL pública do banco: aba do PostgreSQL > Variables > DATABASE_PUBLIC_URL.
Os comandos podem ser executados mais de uma vez: nada é apagado.
"""

import argparse
import mimetypes
import os
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def gerar_arquivo_sql(destino: Path) -> None:
    import storage
    linhas = [
        "-- ============================================================================",
        "-- IMPERADOR LOUNGE BAR - Esquema do banco PostgreSQL",
        f"-- Gerado por criar_tabelas.py em {datetime.now():%d/%m/%Y %H:%M}",
        "-- Pode ser executado mais de uma vez (CREATE ... IF NOT EXISTS).",
        "--",
        "-- Cada tabela tem colunas pesquisáveis + a coluna data (JSONB) com o",
        "-- registro completo usado pelo sistema. Exemplos de consulta:",
        "--   SELECT date(created_at) AS dia, sum(total) FROM orders",
        "--     WHERE order_status <> 'cancelado' GROUP BY 1 ORDER BY 1 DESC;",
        "--   SELECT seller_name, count(*), sum(subtotal) FROM orders GROUP BY 1;",
        "--   SELECT name, stock_deposito, stock_bar, stock_uso FROM products ORDER BY name;",
        "-- ============================================================================",
        "",
        "BEGIN;",
        "",
    ]
    for cmd in storage.gerar_sql_esquema():
        linhas.append(cmd.rstrip() + ";")
        linhas.append("")
    linhas.append("COMMIT;")
    destino.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"Arquivo gerado: {destino} ({len(storage.tabelas())} tabelas)")


def contar_linhas(url: str) -> None:
    import psycopg2
    import storage
    with psycopg2.connect(url, connect_timeout=15) as conn, conn.cursor() as cur:
        print("\nTabelas no banco:")
        for t in storage.tabelas():
            cur.execute("SELECT to_regclass(%s)", (t,))
            if cur.fetchone()[0] is None:
                print(f"  {t:<24} NÃO CRIADA")
                continue
            cur.execute(f"SELECT count(*) FROM {t}")
            print(f"  {t:<24} {cur.fetchone()[0]:>7} registro(s)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Cria as tabelas do Imperador Lounge Bar no PostgreSQL.")
    ap.add_argument("--sql", action="store_true", help="apenas gerar o arquivo schema.sql")
    ap.add_argument("--url", help="URL do PostgreSQL (padrão: variável DATABASE_URL)")
    ap.add_argument("--importar", action="store_true", help="copiar os dados deste computador (data/ e public/uploads/) para o banco")
    ap.add_argument("--dados-iniciais", action="store_true", help="gravar o cardápio de exemplo se o banco estiver vazio")
    ap.add_argument("--forcar", action="store_true", help="com --importar: substituir dados que já existam no banco")
    args = ap.parse_args()

    if args.sql:
        gerar_arquivo_sql(BASE_DIR / "schema.sql")
        return 0

    url = (args.url or os.environ.get("DATABASE_URL") or "").strip()
    if not url.startswith(("postgres://", "postgresql://")):
        print("Informe a URL do PostgreSQL com --url ou na variável DATABASE_URL.")
        print("No Railway: serviço do PostgreSQL > Variables > DATABASE_PUBLIC_URL.")
        return 2

    # O módulo storage escolhe o PostgreSQL quando DATABASE_URL está definida
    os.environ["DATABASE_URL"] = url
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        print("Instale o driver do PostgreSQL:  pip install psycopg2-binary")
        return 2
    import storage

    print(f"Conectando em {url.split('@')[-1]} ...")
    pg = storage.PostgresStore(url)
    pg.criar_esquema()
    print(f"Tabelas criadas/conferidas: {len(storage.tabelas())}")

    if args.importar:
        local = storage.SQLiteStore()
        estado = local.carregar() if storage.SQLITE_PATH.exists() or storage.JSON_PATH.exists() else None
        if estado is None:
            print("Nenhum dado local encontrado em data/. Nada foi importado.")
        else:
            if pg.carregar() is not None and not args.forcar:
                print("O banco já tem dados. Use --forcar para substituir pelos dados deste computador.")
                return 1
            if args.forcar:
                pg.cache_json = None
                pg.hashes, pg.unicos_hash = {}, {}
            import erp
            erp.garantir_erp(estado)
            if not pg.salvar(estado):
                print("Falha ao gravar os dados no banco.")
                return 1
            print(f"Dados importados: {len(estado.get('menuItems', []))} itens do cardápio, "
                  f"{len(estado.get('orders', []))} pedidos, {len(estado.get('erp', {}).get('products', []))} produtos de estoque.")
        usuarios = local.auth_carregar()
        if usuarios and (pg.auth_carregar() is None or args.forcar):
            pg.auth_salvar(usuarios)
            print(f"Usuários importados: {len(usuarios.get('users', []))} (com as mesmas senhas).")
        pasta = storage.UPLOADS_DIR
        if pasta.exists():
            n = 0
            for arq in pasta.iterdir():
                if arq.is_file() and arq.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                    pg.media_gravar(arq.name, mimetypes.guess_type(arq.name)[0] or "image/jpeg", arq.read_bytes())
                    n += 1
            if n:
                print(f"Fotos importadas: {n}")

    elif args.dados_iniciais:
        if pg.carregar() is None:
            import database
            import erp
            estado = database.obter_dados_iniciais_imperador()
            erp.garantir_erp(estado)
            pg.salvar(estado)
            print("Cardápio de exemplo gravado.")
        else:
            print("O banco já tem dados; os dados iniciais não foram gravados.")

    contar_linhas(url)
    print("\nPronto. No Railway, o serviço do sistema usa a variável DATABASE_URL (referência ao banco).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

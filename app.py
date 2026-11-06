# -*- coding: utf-8 -*-
"""
===============================================================================
👑 IMPERADOR LOUNGE BAR - SERVIDOR PRINCIPAL EM PYTHON (SQLite3 + PIX BRCode)
===============================================================================
Sistema Completo para Restaurante, Lounge Bar e Tabacaria (Estilo O Galpão 03 / Tagme):
1. Cardápio Digital QR Code (Tagme Menu Style)
2. Modo Tablet Moderno na Mesa (Autoatendimento + QR Code PIX Oficial c/ CRC16)
3. Painel Administrador & ERP Completo:
   - Controle de Tudo do Site Principal
   - Tudo que Vender (Pedidos, Comandas, PIX, Cartão, Dinheiro)
   - Tudo que Comprar (Fornecedores, Notas e Controle de Estoque)
   - Funcionários (Salários, Diárias, Comissões e Vales)
   - Gastos Fixos (Aluguel, Energia, Água, Internet, Contabilidade, Marketing)
   - Lucro Líquido Real (DRE Automático em Python)

Como executar:
    python app.py
"""

import json
import mimetypes
import os
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from database import (
    calcular_resumo_financeiro_dre,
    inicializar_banco,
    ler_estado_completo,
    obter_dados_iniciais_galpao_imperador,
    salvar_estado_completo,
)
from instagram_publisher import (
    gerar_legenda_instagram,
    publicar_no_instagram_graph_api,
)
from pix_qrcode import gerar_payload_pix_brcode

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
PORT = int(os.environ.get("PORT", 8000))


class ImperadorPythonHandler(BaseHTTPRequestHandler):
    """Handler HTTP em Python para servir a API REST + Interface Web Moderna."""

    def _enviar_headers_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _responder_json(self, status_code: int, dados: dict) -> None:
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self._enviar_headers_cors()
        self.end_headers()
        self.wfile.write(corpo)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._enviar_headers_cors()
        self.end_headers()

    def do_GET(self) -> None:
        url_parsed = urlparse(self.path)
        rota = url_parsed.path
        query = parse_qs(url_parsed.query)

        # 1. API: Obter Estado Completo do SQLite + DRE Calculado em Python
        if rota == "/api/state":
            estado = ler_estado_completo()
            dre = calcular_resumo_financeiro_dre(estado)
            self._responder_json(
                200,
                {
                    "ok": True,
                    "engine": "Python 3 + SQLite3",
                    "state": estado,
                    "drePython": dre,
                },
            )
            return

        # 2. API: Obter Relatório DRE Calculado pelo Python
        if rota == "/api/dre":
            estado = ler_estado_completo()
            dre = calcular_resumo_financeiro_dre(estado)
            self._responder_json(200, {"ok": True, "dre": dre})
            return

        # 3. API: Gerar Payload PIX Oficial (BRCode EMVCo + CRC16-CCITT em Python)
        if rota == "/api/pix":
            estado = ler_estado_completo()
            cfg = estado.get("settings", {})
            valor_str = query.get("valor", ["0"])[0]
            mesa_str = query.get("mesa", ["MESA01"])[0]
            try:
                valor_num = float(valor_str)
            except ValueError:
                valor_num = 0.0

            payload_brcode = gerar_payload_pix_brcode(
                chave_pix=cfg.get("pixKey", "pix@imperadorloungebar.com.br"),
                nome_recebedor=cfg.get("pixMerchantName", "IMPERADOR LOUNGE BAR"),
                cidade_recebedor=cfg.get("pixMerchantCity", "SAO PAULO"),
                valor=valor_num,
                txid=f"IMP{mesa_str}",
            )
            self._responder_json(
                200,
                {
                    "ok": True,
                    "brcode": payload_brcode,
                    "valor": round(valor_num, 2),
                    "chavePix": cfg.get("pixKey"),
                    "recebedor": cfg.get("pixMerchantName"),
                },
            )
            return

        # 4. Servir arquivos estáticos da pasta public/
        caminho_relativo = "/index.html" if rota in ("/", "") else rota
        caminho_seguro = os.path.normpath(caminho_relativo.lstrip("/\\"))
        arquivo_alvo = (PUBLIC_DIR / caminho_seguro).resolve()

        if not str(arquivo_alvo).startswith(str(PUBLIC_DIR.resolve())) or not arquivo_alvo.is_file():
            arquivo_alvo = PUBLIC_DIR / "index.html"

        if not arquivo_alvo.is_file():
            self.send_error(404, "Arquivo nao encontrado")
            return

        tipo_mime, _ = mimetypes.guess_type(str(arquivo_alvo))
        if not tipo_mime:
            tipo_mime = "application/octet-stream"
        if tipo_mime.startswith(("text/", "application/javascript", "application/json")):
            tipo_mime += "; charset=utf-8"

        conteudo = arquivo_alvo.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", tipo_mime)
        self.send_header("Content-Length", str(len(conteudo)))
        self._enviar_headers_cors()
        self.end_headers()
        self.wfile.write(conteudo)

    def do_POST(self) -> None:
        url_parsed = urlparse(self.path)
        rota = url_parsed.path

        tamanho = int(self.headers.get("Content-Length", 0))
        corpo_raw = self.rfile.read(tamanho).decode("utf-8") if tamanho > 0 else "{}"

        try:
            payload = json.loads(corpo_raw) if corpo_raw else {}
        except Exception as exc:
            self._responder_json(400, {"ok": False, "error": f"JSON invalido: {exc}"})
            return

        # API: Salvar/Sincronizar Estado Completo no SQLite3
        if rota == "/api/state":
            novo_estado = payload.get("state")
            if isinstance(novo_estado, dict):
                sucesso = salvar_estado_completo(novo_estado)
                dre = calcular_resumo_financeiro_dre(novo_estado)
                self._responder_json(
                    200,
                    {
                        "ok": sucesso,
                        "updatedAt": datetime.now().isoformat(),
                        "drePython": dre,
                    },
                )
            else:
                self._responder_json(400, {"ok": False, "error": "Campo 'state' ausente"})
            return

        # API: Publicar do Site direto para o Instagram (Meta Graph API / Webhook / Feed do Site)
        if rota == "/api/instagram/publish":
            estado = ler_estado_completo()
            cfg = estado.get("settings", {})
            ig_cfg = cfg.get("instagramConfig", {})

            titulo = payload.get("title", "Novidade no Imperador Lounge Bar")
            descricao = payload.get("description", "")
            preco = float(payload.get("price", 0.0) or 0.0)
            badge = payload.get("badge", "Destaque Imperador")
            image_url = payload.get("imageUrl", cfg.get("heroCoverUrl", ""))
            post_type = payload.get("postType", "FEED")
            caption_custom = (payload.get("caption") or "").strip()

            if not caption_custom:
                caption_custom = gerar_legenda_instagram(
                    titulo=titulo,
                    descricao=descricao,
                    preco=preco,
                    badge=badge,
                    nome_lounge=cfg.get("brandName", "IMPERADOR LOUNGE BAR"),
                    instagram_handle=cfg.get("instagram", "@imperadorloungebar"),
                    endereco=cfg.get("address", ""),
                )

            resultado_ig = publicar_no_instagram_graph_api(
                ig_user_id=payload.get("igUserId") or ig_cfg.get("igUserId", ""),
                access_token=payload.get("accessToken") or ig_cfg.get("accessToken", ""),
                image_url=image_url,
                caption=caption_custom,
                post_type=post_type,
                webhook_url=payload.get("webhookUrl") or ig_cfg.get("webhookUrl", ""),
            )

            self._responder_json(
                200,
                {
                    "ok": True,
                    "caption": caption_custom,
                    "instagramResult": resultado_ig,
                },
            )
            return

        # API: Restaurar dados iniciais do Galpão 03 / Imperador Lounge Bar
        if rota == "/api/reset":
            estado_padrao = obter_dados_iniciais_galpao_imperador()
            salvar_estado_completo(estado_padrao)
            self._responder_json(200, {"ok": True, "state": estado_padrao})
            return

        self._responder_json(404, {"ok": False, "error": "Endpoint nao encontrado"})

    def log_message(self, format: str, *args) -> None:
        # Log limpo no terminal Python
        sys.stdout.write(f"[IMPERADOR PYTHON] {self.address_string()} - {format % args}\n")


def iniciar_servidor() -> None:
    inicializar_banco()
    servidor = ThreadingHTTPServer(("0.0.0.0", PORT), ImperadorPythonHandler)

    url_local = f"http://localhost:{PORT}"
    print("=" * 74)
    print("👑 IMPERADOR LOUNGE BAR - SISTEMA EM PYTHON + SQLITE3 INICIADO!")
    print("=" * 74)
    print(f"🌐 Sistema Principal:                        {url_local}")
    print(f"📱 Cardápio Digital (Estilo Galpão 03/Tagme): {url_local}/?view=menu")
    print(f"🖥️ Modo Tablet na Mesa (Autoatendimento PIX): {url_local}/?view=tablet")
    print(f"💼 Painel Administrador & ERP Financeiro:     {url_local}/?view=admin")
    print(f"🗄️ Banco de Dados SQLite3:                   data/imperador_lounge.db")
    print("=" * 74)
    print("Pressione CTRL+C para encerrar o servidor.")

    # Abre automaticamente o navegador após 1 segundo
    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(url_local)).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando servidor Python Imperador Lounge Bar...")
        servidor.server_close()


if __name__ == "__main__":
    iniciar_servidor()


# -*- coding: utf-8 -*-
"""
===============================================================================
📸 MÓDULO PYTHON DE INTEGRAÇÃO AUTOMÁTICA: SITE ➔ INSTAGRAM
===============================================================================
Tudo que for postado no Site Principal ou no Cardápio do IMPERADOR LOUNGE BAR
é formatado e enviado automaticamente para o Instagram via:
1. API Oficial do Instagram Graph (Meta Business - Feed & Stories)
2. Webhook de Automação (n8n / Make / Zapier)
3. Fila local sincronizada + Gerador de Arte 1080x1080 / 1080x1920 (Stories)
"""

import json
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime
from typing import Dict, Any


def gerar_legenda_instagram(
    titulo: str,
    descricao: str = "",
    preco: float = 0.0,
    preco_antigo: float = 0.0,
    badge: str = "",
    nome_lounge: str = "IMPERADOR LOUNGE BAR",
    instagram_handle: str = "@imperadorloungebar",
    endereco: str = "Av. Imperial, 300 - Centro",
    link_cardapio: str = "",
) -> str:
    """Gera automaticamente uma legenda de alta conversão para o Instagram."""
    linhas = []
    selo_topo = f"👑 {badge.upper()} • {nome_lounge}" if badge else f"👑 {nome_lounge}"
    linhas.append(selo_topo)
    linhas.append("")
    linhas.append(f"🔥 {titulo}")

    if descricao:
        linhas.append(f"✨ {descricao}")

    if preco and float(preco) > 0:
        preco_fmt = f"R$ {float(preco):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        if preco_antigo and float(preco_antigo) > float(preco):
            antigo_fmt = f"R$ {float(preco_antigo):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            linhas.append(f"💰 De {antigo_fmt} por apenas *{preco_fmt}*!")
        else:
            linhas.append(f"💰 Valor especial: *{preco_fmt}*")

    linhas.append("")
    linhas.append("📲 Peça direto na mesa pelo nosso Tablet com PIX QR Code ou acesse o Cardápio Digital no link da Bio!")
    if endereco:
        linhas.append(f"📍 {endereco}")
    if link_cardapio:
        linhas.append(f"🔗 Cardápio Digital: {link_cardapio}")

    linhas.append("")
    linhas.append(
        f"{instagram_handle} #ImperadorLoungeBar #LoungeBar #Tabacaria #Narguile "
        f"#Rosh #DrinksAutorais #NoiteImperial #Gastrobar #HappyHour #VemProImperador"
    )
    return "\n".join(linhas)


def publicar_no_instagram_graph_api(
    ig_user_id: str,
    access_token: str,
    image_url: str,
    caption: str,
    post_type: str = "FEED",
    webhook_url: str = "",
) -> Dict[str, Any]:
    """
    Publica uma foto + legenda diretamente no Instagram usando a API Oficial Meta Graph v21.0
    (ou dispara para um Webhook de automação se configurado).
    """
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Se houver Webhook configurado (Make / Zapier / n8n), envia os dados do post
    if webhook_url and webhook_url.strip().startswith("http"):
        try:
            payload_bytes = json.dumps(
                {
                    "source": "IMPERADOR_LOUNGE_SITE",
                    "timestamp": agora,
                    "postType": post_type,
                    "imageUrl": image_url,
                    "caption": caption,
                    "igUserId": ig_user_id,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            req = urllib.request.Request(
                webhook_url.strip(),
                data=payload_bytes,
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {
                    "ok": True,
                    "mode": "webhook_published",
                    "status": "Publicado no Site + Enviado ao Webhook do Instagram",
                    "httpStatus": resp.status,
                    "publishedAt": agora,
                }
        except Exception as exc:
            return {
                "ok": False,
                "mode": "webhook_error",
                "status": f"Publicado no Site (Erro no Webhook: {exc})",
                "publishedAt": agora,
            }

    # 2. Se o usuário preencheu o IG User ID e o Access Token da Meta Graph API
    ig_id_clean = (ig_user_id or "").strip()
    token_clean = (access_token or "").strip()

    if ig_id_clean and token_clean:
        try:
            # Passo 1: Criar Container de Mídia na Graph API
            url_create = f"https://graph.facebook.com/v21.0/{ig_id_clean}/media"
            params = {
                "image_url": image_url,
                "caption": caption,
                "access_token": token_clean,
            }
            if post_type.upper() == "STORIES":
                params["media_type"] = "STORIES"

            data_encoded = urllib.parse.urlencode(params).encode("utf-8")
            req_create = urllib.request.Request(url_create, data=data_encoded, method="POST")

            with urllib.request.urlopen(req_create, timeout=15) as resp_create:
                res_json = json.loads(resp_create.read().decode("utf-8"))
                creation_id = res_json.get("id")

            if not creation_id:
                return {
                    "ok": False,
                    "mode": "graph_api_error",
                    "status": f"Erro ao criar mídia no Instagram: {res_json}",
                    "publishedAt": agora,
                }

            # Passo 2: Publicar o Container criado (/media_publish)
            url_publish = f"https://graph.facebook.com/v21.0/{ig_id_clean}/media_publish"
            pub_params = urllib.parse.urlencode(
                {
                    "creation_id": creation_id,
                    "access_token": token_clean,
                }
            ).encode("utf-8")
            req_pub = urllib.request.Request(url_publish, data=pub_params, method="POST")

            with urllib.request.urlopen(req_pub, timeout=15) as resp_pub:
                pub_json = json.loads(resp_pub.read().decode("utf-8"))
                media_id = pub_json.get("id")

            return {
                "ok": True,
                "mode": "graph_api_official",
                "instagramMediaId": media_id,
                "status": f"Publicado Ao Vivo no Instagram Oficial (ID: {media_id})",
                "publishedAt": agora,
            }

        except urllib.error.HTTPError as http_err:
            detalhe = http_err.read().decode("utf-8", errors="ignore")
            return {
                "ok": False,
                "mode": "graph_api_http_error",
                "status": f"Publicado no Site • Aviso API Meta: {detalhe[:140]}",
                "publishedAt": agora,
            }
        except Exception as exc:
            return {
                "ok": False,
                "mode": "graph_api_exception",
                "status": f"Publicado no Site • Erro de conexão API Meta: {exc}",
                "publishedAt": agora,
            }

    # 3. Modo Sincronizado Local + Arte Pronta (Quando o Token ainda não foi inserido)
    return {
        "ok": True,
        "mode": "site_feed_and_ready_share",
        "status": "Publicado no Feed/Stories do Site + Arte & Legenda Prontas p/ Instagram",
        "publishedAt": agora,
    }

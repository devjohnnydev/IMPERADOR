# -*- coding: utf-8 -*-
"""
Banco de Dados SQLite3 + Persistência JSON para o Sistema IMPERADOR LOUNGE BAR.
Gerencia:
- Configurações do Site Principal e PIX
- Cardápio Digital Completo (Tabacaria, Rosh, Combos, Drinks, Cervejas, Porções, Burgers, Sobremesas)
- Mesas & Camarotes VIP
- Tudo que Vender (Pedidos via QR Code, Tablet PIX e Balcão PDV)
- Tudo que Comprar (Compras de fornecedores e controle de estoque)
- Funcionários (Salários, diárias, comissões e adiantamentos)
- Gastos Fixos Mensais (Aluguel, luz, água, internet, contabilidade, marketing)
- Cálculo de DRE e Lucro Líquido Real em Python
"""

import json
import sqlite3
from pathlib import Path
from typing import Dict, Any

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_SQLITE_PATH = DATA_DIR / "imperador_lounge.db"
DB_JSON_PATH = DATA_DIR / "db.json"


def obter_dados_iniciais_imperador() -> Dict[str, Any]:
    """Retorna a estrutura inicial completa para o Imperador Lounge Bar."""
    return {
        "settings": {
            "brandName": "IMPERADOR LOUNGE BAR",
            "brandSubtitle": "Lounge • Tabacaria • Gastrobar • Drinks Autorais",
            "tagline": "A Experiência Imperial inspirada no melhor estilo Lounge & Tabacaria",
            "instagram": "@imperadorloungebar",
            "referenceNote": "Cardápio Digital Imperador",
            "address": "Av. Imperial, 300 - Centro • Lounge & Deck VIP",
            "openingHours": "Terça a Domingo • 17:00 às 04:00",
            "wifiSsid": "IMPERADOR_LOUNGE_5G",
            "wifiPass": "imperador2026",
            "whatsapp": "5511999990003",
            "pixKey": "pix@imperadorloungebar.com.br",
            "pixKeyType": "E-mail / CNPJ",
            "pixMerchantName": "IMPERADOR LOUNGE BAR",
            "pixMerchantCity": "SAO PAULO",
            "serviceFeePercent": 10,
            "enableServiceFeeByDefault": True,
            "isOpen": True,
            "bannerAnnouncement": "🔥 HAPPY HOUR IMPERIAL: Double Rosh & Balde de Heineken com preço especial até às 21h! Peça direto pelo Tablet ou QR Code com PIX instantâneo.",
            "heroCoverUrl": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1400&q=80",
            "adminPin": "1234",
            "instagramConfig": {
                "profileUrl": "https://www.instagram.com/imperadorloungebar/",
                "autoPostNewProducts": True,
                "autoPostPromotions": True,
                "igUserId": "",
                "accessToken": "",
                "webhookUrl": "",
            },
        },
        "socialPosts": [
            {
                "id": "POST-IG-01",
                "title": "🔥 SEXTA IMPERIAL: Double Sessão Rosh (Love 66 / Ziggy) + DJ Residente",
                "caption": "👑 IMPERADOR LOUNGE BAR\n\n🔥 Hoje tem Double Sessão de Narguilé com as melhores essências (Adalya Love 66, Ziggy Tropical e Zomo Swiss Alps)!\n💰 De R$ 85,00 por apenas *R$ 69,90*!\n\n📲 Peça direto no Tablet da sua mesa com PIX QR Code!\n#ImperadorLoungeBar #Tabacaria #Narguile #LoungeVIP",
                "imageUrl": "https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=800&q=80",
                "price": 69.90,
                "badge": "Story & Feed",
                "postType": "FEED + STORIES",
                "linkedItemId": "item-rosh-imperial-double",
                "createdAt": "Hoje • 18:30",
                "igStatus": "Publicado no Site & Sincronizado c/ Instagram",
                "likes": 248,
            },
            {
                "id": "POST-IG-02",
                "title": "🍾 Combo Gin Tanqueray + 5 Red Bull Tropical no Camarote Imperial",
                "caption": "👑 REI DO CAMAROTE • IMPERADOR LOUNGE BAR\n\n🔥 Combo Gin Tanqueray 750ml + 5 Red Bull + Especiarias e Taças de Cristal!\n💰 Valor especial: *R$ 349,90*\n\n📍 Av. Imperial, 300 - Centro\n#ImperadorLoungeBar #GinTanqueray #CamaroteVIP #Drinks",
                "imageUrl": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
                "price": 349.90,
                "badge": "Camarote VIP",
                "postType": "FEED",
                "linkedItemId": "item-combo-tanqueray",
                "createdAt": "Hoje • 19:15",
                "igStatus": "Publicado no Site & Sincronizado c/ Instagram",
                "likes": 312,
            },
            {
                "id": "POST-IG-03",
                "title": "🥩 Tábua Imperial: Picanha na Chapa + Fritas Cheddar & Bacon",
                "caption": "👑 GASTRONOMIA DE LOUNGE • IMPERADOR\n\n🔥 500g de Picanha Maturada na chapa fumegante + 400g de Fritas com Cheddar Cremoso e Bacon!\n💰 Apenas *R$ 119,90* (Serve 3 a 4 pessoas)\n\n#ImperadorLoungeBar #PicanhaNaChapa #Gastrobar #Porcoes",
                "imageUrl": "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
                "price": 119.90,
                "badge": "Gastronomia",
                "postType": "STORIES",
                "linkedItemId": "item-tabua-imperador-chapa",
                "createdAt": "Hoje • 20:00",
                "igStatus": "Publicado no Site & Sincronizado c/ Instagram",
                "likes": 419,
            },
        ],
        "categories": [
            {"id": "destaques", "name": "Destaques & Promoções", "icon": "🔥", "order": 1, "station": "bar", "description": "Os campeões de vendas da noite e combos especiais Happy Hour"},
            {"id": "tabacaria", "name": "Tabacaria & Narguilé (Rosh)", "icon": "💨", "order": 2, "station": "tabacaria", "description": "Sessões completas, Rosh avulso (Ziggy, Zomo, Adalya, Nay, Onix), Mix da Casa e Insumos"},
            {"id": "combos", "name": "Combos & Garrafas VIP", "icon": "🍾", "order": 3, "station": "bar", "description": "Combos de Gin, Whisky 12 Anos, Vodka Premium e Espumantes com Energéticos e Gelo de Coco"},
            {"id": "drinks", "name": "Drinks Autorais & Caipirinhas", "icon": "🍹", "order": 4, "station": "bar", "description": "Coquetelaria Imperial, Gin Tônica Especiarias, Moscow Mule e Caipiroskas de Frutas Frescas"},
            {"id": "cervejas", "name": "Cervejas, Baldes & Energéticos", "icon": "🍺", "order": 5, "station": "bar", "description": "Baldes trincando de Heineken, Corona, Spaten, Original 600ml, Beats e Red Bull"},
            {"id": "porcoes", "name": "Porções, Chapas & Petiscos", "icon": "🍟", "order": 6, "station": "cozinha", "description": "Gastronomia de Lounge: Picanha na Chapa, Batata Suprema Cheddar & Bacon, Coxinha sem Massa e Tábuas"},
            {"id": "burgers", "name": "Burgers & Lanches Artesanais", "icon": "🍔", "order": 7, "station": "cozinha", "description": "Blend bovino suculento na brasa, queijo derretido e batata rústica"},
            {"id": "sobremesas", "name": "Sobremesas & Sem Álcool", "icon": "🍫", "order": 8, "station": "bar", "description": "Petit Gâteau, Soda Italiana, Sucos Naturais, Refrigerantes e Águas"},
        ],
        "menuItems": [
            {
                "id": "item-rosh-imperial-double",
                "categoryId": "destaques",
                "name": "Double Sessão Narguilé Imperial (2 Roshs)",
                "description": "Sessão completa no Narguilé Imperial Sultan/Zeus com 1º Rosh na hora + 1 Troca de Rosh inclusa, mangueira descartável lacrada, controle de calor Kaloud e troca de carvão de coco inclusa.",
                "price": 69.90,
                "oldPrice": 85.00,
                "costPrice": 18.50,
                "stock": 80,
                "minStock": 15,
                "unit": "sessão",
                "featured": True,
                "badge": "Campeão da Casa",
                "prepTime": "8 min",
                "image": "https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=800&q=80",
                "options": [
                    {
                        "groupName": "Sabor do 1º Rosh (Essência)",
                        "required": True,
                        "choices": [
                            {"name": "Mix Imperador (Maracujá + Menta + Melancia)", "price": 0},
                            {"name": "Adalya Love 66 (Melancia, Melão, Maracujá e Menta)", "price": 0},
                            {"name": "Ziggy Tropical / Frutas Amarelas c/ Toque Ice", "price": 0},
                            {"name": "Ziggy Burley Melancia Atômica + Cane Mint", "price": 0},
                            {"name": "Zomo Swiss Alps + Strong Mint (Super Gelado)", "price": 0},
                            {"name": "Nay Doce de Leite c/ Paçoca & Baunilha (Doce)", "price": 0},
                            {"name": "Onix High Lemon (Limão Siciliano Ice)", "price": 0},
                        ],
                    },
                    {
                        "groupName": "Upgrade no Vaso",
                        "required": False,
                        "choices": [
                            {"name": "Água + Gelo Tradicional (Incluso)", "price": 0},
                            {"name": "Vaso com Gelo + Limão Siciliano & Hortelã", "price": 8.00},
                            {"name": "Base com Led + Abacaxi / Frutas no Vaso", "price": 15.00},
                        ],
                    },
                ],
            },
            {
                "id": "item-balde-heineken-6",
                "categoryId": "destaques",
                "name": "Balde Imperial c/ 6 Heineken Long Neck 330ml",
                "description": "6 Cervejas Heineken Long Neck 330ml servidas no balde de alumínio Imperial com gelo escama trincando.",
                "price": 79.90,
                "oldPrice": 90.00,
                "costPrice": 37.80,
                "stock": 45,
                "minStock": 10,
                "unit": "balde",
                "featured": True,
                "badge": "Super Pedido",
                "prepTime": "3 min",
                "image": "https://images.unsplash.com/photo-1608270196042-a8690097e270?auto=format&fit=crop&w=800&q=80",
                "options": [
                    {
                        "groupName": "Acompanhamento de Copos",
                        "required": True,
                        "choices": [
                            {"name": "Beber na Long Neck + Guardanapos", "price": 0},
                            {"name": "Trazer Taças Geladas", "price": 0},
                            {"name": "Acompanhar Limão Fatiado", "price": 3.00},
                        ],
                    }
                ],
            },
            {
                "id": "item-tabua-imperador-chapa",
                "categoryId": "destaques",
                "name": "Tábua Imperial (Picanha + Fritas Cheddar & Bacon)",
                "description": "500g de Tiras de Picanha Maturada grelhada na chapa fumegante com cebola roxa caramelizada, acompanhada de 400g de Batata Frita crocante coberta com Cheddar cremoso, farofa de bacon, pão de alho, vinagrete, farofa temperada e maionese verde da casa.",
                "price": 119.90,
                "oldPrice": 139.90,
                "costPrice": 46.00,
                "stock": 30,
                "minStock": 8,
                "unit": "tábua",
                "featured": True,
                "badge": "Serve 3 a 4 Pessoas",
                "prepTime": "18 min",
                "image": "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
                "options": [
                    {
                        "groupName": "Ponto da Carne",
                        "required": True,
                        "choices": [
                            {"name": "Ao Ponto (Suculenta - Recomendado)", "price": 0},
                            {"name": "Mal Passada", "price": 0},
                            {"name": "Bem Passada", "price": 0},
                        ],
                    }
                ],
            },
            {
                "id": "item-sessao-simples",
                "categoryId": "tabacaria",
                "name": "Sessão Narguilé Tradicional (1 Rosh Completo)",
                "description": "Aparelho completo higienizado + 1 Rosh preparado pelo nosso Roshzeiro Master com Kaloud Lotus, 3 carvões de coco hexagonais + 1 troca de carvão e piteira higiênica descartável.",
                "price": 40.00,
                "costPrice": 10.50,
                "stock": 120,
                "minStock": 20,
                "unit": "sessão",
                "featured": True,
                "badge": "Tabacaria Oficial",
                "prepTime": "7 min",
                "image": "https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=800&q=80",
                "options": [
                    {
                        "groupName": "Perfil do Rosh",
                        "required": True,
                        "choices": [
                            {"name": "Cítrico Gelado (Maracujá + Limão + Menta)", "price": 0},
                            {"name": "Frutado Refrescante (Love 66 / Melancia + Melão Ice)", "price": 0},
                            {"name": "Tropical Mix (Manga + Maracujá + Abacaxi Ice)", "price": 0},
                            {"name": "Doce Cremoso (Cappuccino / Doce de Leite + Baunilha)", "price": 0},
                            {"name": "Menta Extrema (Cane Mint + Swiss Alps)", "price": 0},
                        ],
                    }
                ],
            },
            {
                "id": "item-troca-rosh-avulso",
                "categoryId": "tabacaria",
                "name": "Troca de Rosh Avulso (Reposição na Mesa)",
                "description": "Novo Rosh montado na hora com 3 carvões de coco novos acesos e limpeza do Kaloud. Escolha sua essência favorita (Ziggy, Zomo, Adalya, Nay ou Onix).",
                "price": 28.00,
                "costPrice": 7.50,
                "stock": 150,
                "minStock": 30,
                "unit": "rosh",
                "featured": False,
                "badge": "Reposição Rápida",
                "prepTime": "6 min",
                "image": "https://images.unsplash.com/photo-1510626176961-4b57d4fbad03?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-rosh-abacaxi-natural",
                "categoryId": "tabacaria",
                "name": "Sessão Imperial no Rosh de Abacaxi Natural",
                "description": "Experiência exclusiva de camarote: Rosh esculpido na fruta natural (Abacaxi pérola fresco), garantindo fumaça densa, sabor prolongado por até 2h e visual incrível para fotos.",
                "price": 75.00,
                "costPrice": 22.00,
                "stock": 18,
                "minStock": 5,
                "unit": "sessão",
                "featured": True,
                "badge": "Exclusivo VIP",
                "prepTime": "14 min",
                "image": "https://images.unsplash.com/photo-1497534446932-c925b458314e?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-tabacaria-kit-seda-pod",
                "categoryId": "tabacaria",
                "name": "Pod Descartável Ignite V80 / Elfbar (8.000 Puffs)",
                "description": "Pod descartável original lacrado na caixa com QR Code de verificação. Diversos sabores gelados disponíveis na vitrine da tabacaria.",
                "price": 110.00,
                "costPrice": 52.00,
                "stock": 25,
                "minStock": 6,
                "unit": "unid",
                "featured": False,
                "badge": "Tabacaria Shop",
                "prepTime": "2 min",
                "image": "https://images.unsplash.com/photo-1560913210-91e811632701?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-carvao-extra",
                "categoryId": "tabacaria",
                "name": "Porção Extra de Carvão de Coco Aceso (3 unid)",
                "description": "3 unidades de carvão de coco premium 100% natural já acesos no fogareiro e levados na cesta térmica pelo Roshzeiro.",
                "price": 8.00,
                "costPrice": 1.80,
                "stock": 300,
                "minStock": 50,
                "unit": "porção",
                "featured": False,
                "badge": "Atendimento Mesa",
                "prepTime": "4 min",
                "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-combo-tanqueray",
                "categoryId": "combos",
                "name": "Combo Gin Tanqueray London Dry 750ml + 5 Red Bull / Tônicas",
                "description": "1 Garrafa de Gin Tanqueray 750ml lacrada + 5 acompanhamentos à sua escolha (Red Bull ou Água Tônica) + Bandeja de Especiarias + Taças de Cristal.",
                "price": 349.90,
                "oldPrice": 389.90,
                "costPrice": 145.00,
                "stock": 16,
                "minStock": 4,
                "unit": "combo",
                "featured": True,
                "badge": "Rei do Camarote",
                "prepTime": "5 min",
                "image": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-combo-old-parr",
                "categoryId": "combos",
                "name": "Combo Whisky Grand Old Parr 12 Anos 1L + 4 Red Bull + 4 Gelos de Coco",
                "description": "1 Garrafa de Whisky Old Parr 12 Anos 1000ml + 4 Latas de Red Bull + 4 Gelos de Água de Coco ou Melancia + Balde Iluminado LED.",
                "price": 369.90,
                "costPrice": 158.00,
                "stock": 14,
                "minStock": 4,
                "unit": "combo",
                "featured": True,
                "badge": "Top Vendas",
                "prepTime": "5 min",
                "image": "https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-combo-jack-daniels",
                "categoryId": "combos",
                "name": "Combo Whisky Jack Daniel's Nº7 ou Maçã Verde 1L + 5 Acompanhamentos",
                "description": "1 Garrafa de Jack Daniel's 1L (Tradicional, Apple ou Honey) + 4 Red Bull ou 5 Coca-Cola Lata + 4 Gelos de Coco.",
                "price": 359.90,
                "costPrice": 152.00,
                "stock": 15,
                "minStock": 4,
                "unit": "combo",
                "featured": False,
                "badge": "Clássico Lounge",
                "prepTime": "5 min",
                "image": "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-drink-imperador-gold",
                "categoryId": "drinks",
                "name": "Drink Imperador Gold (Gin, Maracujá, Mel & Espuma de Gengibre)",
                "description": "Drink assinatura da casa: Gin importado, redução artesanal de maracujá com pimenta rosa, toque de limão siciliano, finalizado com espuma aveludada de gengibre e pó dourado comestível.",
                "price": 34.90,
                "costPrice": 9.80,
                "stock": 60,
                "minStock": 10,
                "unit": "taça",
                "featured": True,
                "badge": "Assinatura Imperador",
                "prepTime": "6 min",
                "image": "https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-drink-gin-tropical",
                "categoryId": "drinks",
                "name": "Taça Gin Tropical Red Bull (600ml)",
                "description": "Dose dupla de Gin, Red Bull Tropical, fatias de laranja bahia, abacaxi grelhado e zimbro aromático em taça de 600ml.",
                "price": 32.90,
                "costPrice": 10.20,
                "stock": 75,
                "minStock": 15,
                "unit": "taça",
                "featured": True,
                "badge": "Mais Vendido",
                "prepTime": "5 min",
                "image": "https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-caipiroska-imperial",
                "categoryId": "drinks",
                "name": "Caipiroska / Caipirinha Gourmet (500ml c/ Picolé)",
                "description": "Frutas frescas maceradas na hora com escolha da base alcoólica e acompanhada de picolé de fruta mergulhado no copo.",
                "price": 29.90,
                "costPrice": 8.20,
                "stock": 65,
                "minStock": 10,
                "unit": "copo",
                "featured": True,
                "badge": "C/ Picolé",
                "prepTime": "6 min",
                "image": "https://images.unsplash.com/photo-1560512823-829485b8bf24?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-balde-corona-6",
                "categoryId": "cervejas",
                "name": "Balde c/ 6 Corona Extra Long Neck 330ml + Limão",
                "description": "6 Cervejas Corona Extra 330ml trincando no balde com gelo e gomos de limão taiti para colocar no gargalo.",
                "price": 84.90,
                "costPrice": 41.40,
                "stock": 35,
                "minStock": 8,
                "unit": "balde",
                "featured": False,
                "badge": "Com Limão",
                "prepTime": "3 min",
                "image": "https://images.unsplash.com/photo-1608270196042-a8690097e270?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-batata-suprema",
                "categoryId": "porcoes",
                "name": "Batata Frita Suprema (Cheddar Cremoso & Bacon)",
                "description": "500g de batatas fritas corte crinkle/palito super crocantes, generosamente cobertas com molho cheddar derretido, cubos de bacon defumado e cebolinha fresca.",
                "price": 48.90,
                "costPrice": 15.20,
                "stock": 55,
                "minStock": 10,
                "unit": "porção",
                "featured": True,
                "badge": "Clássico do Lounge",
                "prepTime": "12 min",
                "image": "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-coxinha-sem-massa",
                "categoryId": "porcoes",
                "name": "Porção de Mini Coxinhas Cremosas Sem Massa c/ Catupiry (10 un)",
                "description": "10 unidades de coxinhas artesanais feitas com puro frango desfiado temperado e Catupiry, empanadas na farinha Panko dourada.",
                "price": 44.90,
                "costPrice": 14.00,
                "stock": 40,
                "minStock": 10,
                "unit": "porção",
                "featured": True,
                "badge": "Imperdível",
                "prepTime": "12 min",
                "image": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-file-gorgonzola",
                "categoryId": "porcoes",
                "name": "Filé Mignon na Chapa ao Molho Gorgonzola c/ Pão de Alho",
                "description": "450g de tiras de Filé Mignon salteadas na manteiga de garrafa, cobertas com fonduta cremosa de queijo gorgonzola e torradas de pão de alho.",
                "price": 89.90,
                "costPrice": 34.00,
                "stock": 25,
                "minStock": 6,
                "unit": "porção",
                "featured": False,
                "badge": "Gastronomia VIP",
                "prepTime": "16 min",
                "image": "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-burger-imperador-duplo",
                "categoryId": "burgers",
                "name": "Burger Imperador Duplo Smash Bacon + Fritas Individual",
                "description": "Pão brioche selado na manteiga, 2 blends bovinos de 100g cada na grelha, quádruplo queijo cheddar inglês, fatias de bacon crocante e molho especial Imperador.",
                "price": 42.90,
                "costPrice": 14.50,
                "stock": 40,
                "minStock": 8,
                "unit": "combo",
                "featured": True,
                "badge": "Acompanha Fritas",
                "prepTime": "14 min",
                "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
            {
                "id": "item-petit-gateau",
                "categoryId": "sobremesas",
                "name": "Petit Gâteau Imperial c/ Sorvete de Creme & Calda de Nutella",
                "description": "Bolinho quente de chocolate meio amargo belga com interior cremoso, servido com bola de sorvete de baunilha, morangos frescos e fio de Nutella.",
                "price": 28.90,
                "costPrice": 8.90,
                "stock": 30,
                "minStock": 6,
                "unit": "unid",
                "featured": False,
                "badge": "Sobremesa",
                "prepTime": "9 min",
                "image": "https://images.unsplash.com/photo-1624353365286-3f8d62daad51?auto=format&fit=crop&w=800&q=80",
                "options": [],
            },
        ],
        "tables": [
            {"id": "Mesa 01", "name": "Mesa 01 (Deck Entrada)", "area": "Deck Lounge", "capacity": 4, "status": "ocupada"},
            {"id": "Mesa 02", "name": "Mesa 02 (Deck Entrada)", "area": "Deck Lounge", "capacity": 4, "status": "ocupada"},
            {"id": "Mesa 03", "name": "Mesa 03 (Salão Principal)", "area": "Salão Central", "capacity": 4, "status": "livre"},
            {"id": "Mesa 04", "name": "Mesa 04 (Salão Principal)", "area": "Salão Central", "capacity": 6, "status": "ocupada"},
            {"id": "Mesa 05", "name": "Mesa 05 (Salão Principal)", "area": "Salão Central", "capacity": 4, "status": "livre"},
            {"id": "Mesa 06", "name": "Mesa 06 (Salão Principal)", "area": "Salão Central", "capacity": 4, "status": "livre"},
            {"id": "Mesa 07", "name": "Mesa 07 (Próximo ao DJ)", "area": "Pista & DJ", "capacity": 6, "status": "ocupada"},
            {"id": "Mesa 08", "name": "Mesa 08 (Próximo ao DJ)", "area": "Pista & DJ", "capacity": 4, "status": "livre"},
            {"id": "Camarote 01", "name": "Camarote Imperial 01", "area": "Área VIP", "capacity": 10, "status": "ocupada"},
            {"id": "Camarote 02", "name": "Camarote Imperial 02", "area": "Área VIP", "capacity": 10, "status": "ocupada"},
            {"id": "Camarote 03", "name": "Camarote Imperial 03", "area": "Área VIP", "capacity": 8, "status": "livre"},
            {"id": "Balcão Bar", "name": "Balcão / Venda Rápida", "area": "Bar Central", "capacity": 8, "status": "livre"},
        ],
        "waiterCalls": [
            {
                "id": "call-101",
                "tableId": "Camarote 01",
                "type": "carvao",
                "message": "Trocar Carvão do Narguilé (Rosh Love 66)",
                "createdAt": "21:42",
                "status": "pendente",
            },
            {
                "id": "call-102",
                "tableId": "Mesa 02",
                "type": "garcom",
                "message": "Cliente solicitou atendimento / balde de gelo extra",
                "createdAt": "21:48",
                "status": "pendente",
            },
        ],
        "orders": [
            {
                "id": "PED-9041",
                "tableId": "Camarote 01",
                "customerName": "Lucas & Grupo VIP",
                "source": "Tablet Mesa (PIX QR Code)",
                "paymentMethod": "PIX QR Code",
                "paymentStatus": "pago",
                "orderStatus": "entregue",
                "createdAt": "2026-11-06 19:35",
                "subtotal": 494.70,
                "serviceFee": 49.47,
                "total": 544.17,
                "costTotal": 197.50,
                "items": [
                    {"itemId": "item-combo-tanqueray", "name": "Combo Gin Tanqueray London Dry 750ml + 5 Red Bull / Tônicas", "qty": 1, "price": 349.90, "costPrice": 145.00, "notes": "5x Red Bull Tropical"},
                    {"itemId": "item-rosh-abacaxi-natural", "name": "Sessão Imperial no Rosh de Abacaxi Natural", "qty": 1, "price": 75.00, "costPrice": 22.00, "notes": "Abacaxi + Hortelã + Maracujá Ice"},
                    {"itemId": "item-rosh-imperial-double", "name": "Double Sessão Narguilé Imperial (2 Roshs)", "qty": 1, "price": 69.80, "costPrice": 30.50, "notes": "Adalya Love 66"},
                ],
            },
            {
                "id": "PED-9042",
                "tableId": "Mesa 01",
                "customerName": "Matheus Silva",
                "source": "Cardápio QR Code",
                "paymentMethod": "PIX QR Code",
                "paymentStatus": "pago",
                "orderStatus": "entregue",
                "createdAt": "2026-11-06 20:10",
                "subtotal": 239.70,
                "serviceFee": 23.97,
                "total": 263.67,
                "costTotal": 102.30,
                "items": [
                    {"itemId": "item-balde-heineken-6", "name": "Balde Imperial c/ 6 Heineken Long Neck 330ml", "qty": 1, "price": 79.90, "costPrice": 37.80, "notes": "Trazer Taças Geladas"},
                    {"itemId": "item-tabua-imperador-chapa", "name": "Tábua Imperial (Picanha + Fritas Cheddar & Bacon)", "qty": 1, "price": 119.90, "costPrice": 46.00, "notes": "Ao Ponto Suculenta"},
                    {"itemId": "item-sessao-simples", "name": "Sessão Narguilé Tradicional (1 Rosh Completo)", "qty": 1, "price": 40.00, "costPrice": 18.50, "notes": "Cítrico Gelado"},
                ],
            },
            {
                "id": "PED-9043",
                "tableId": "Camarote 02",
                "customerName": "Fernanda Oliveira",
                "source": "Tablet Mesa (PIX QR Code)",
                "paymentMethod": "PIX QR Code",
                "paymentStatus": "pago",
                "orderStatus": "entregue",
                "createdAt": "2026-11-06 20:45",
                "subtotal": 523.60,
                "serviceFee": 52.36,
                "total": 575.96,
                "costTotal": 205.80,
                "items": [
                    {"itemId": "item-combo-old-parr", "name": "Combo Whisky Grand Old Parr 12 Anos 1L + 4 Red Bull + 4 Gelos de Coco", "qty": 1, "price": 369.90, "costPrice": 158.00, "notes": "4x Gelo de Coco"},
                    {"itemId": "item-batata-suprema", "name": "Batata Frita Suprema (Cheddar Cremoso & Bacon)", "qty": 1, "price": 48.90, "costPrice": 15.20, "notes": ""},
                    {"itemId": "item-coxinha-sem-massa", "name": "Porção de Mini Coxinhas Cremosas Sem Massa c/ Catupiry (10 un)", "qty": 1, "price": 44.90, "costPrice": 14.00, "notes": ""},
                    {"itemId": "item-caipiroska-imperial", "name": "Caipiroska / Caipirinha Gourmet (500ml c/ Picolé)", "qty": 2, "price": 29.95, "costPrice": 9.30, "notes": "Morango c/ Maracujá"},
                ],
            },
        ],
        "purchases": [
            {
                "id": "COMP-301",
                "date": "2026-11-02",
                "supplier": "Distribuidora Imperial Bebidas & Destilados",
                "category": "Bebidas & Destilados",
                "description": "Caixas de Heineken Long Neck, Corona, Gin Tanqueray, Whisky Old Parr 12 e Jack Daniel's",
                "qty": 12,
                "unit": "lotes/cx",
                "totalCost": 1850.00,
                "paymentMethod": "PIX Fornecedor",
                "status": "pago",
            },
            {
                "id": "COMP-302",
                "date": "2026-11-03",
                "supplier": "Atacado Tabacaria Sultan & Essências Brasil",
                "category": "Tabacaria & Narguilé",
                "description": "Packs de Essências Ziggy, Adalya Love 66, Zomo, Nay, 30kg Carvão de Coco Hexagonal, Alumínio e Piteiras",
                "qty": 8,
                "unit": "packs",
                "totalCost": 940.00,
                "paymentMethod": "PIX Fornecedor",
                "status": "pago",
            },
            {
                "id": "COMP-303",
                "date": "2026-11-04",
                "supplier": "Frigorífico Prime & Hortifruti Central",
                "category": "Cozinha & Carnes",
                "description": "Peças de Picanha Maturada, Filé Mignon, Batata Congelada Crinkle, Bacon Defumado, Queijo Cheddar e Frutas p/ Drinks",
                "qty": 1,
                "unit": "compra semanal",
                "totalCost": 1120.00,
                "paymentMethod": "Cartão Corporativo",
                "status": "pago",
            },
            {
                "id": "COMP-304",
                "date": "2026-11-05",
                "supplier": "Red Bull Brasil Distribuição Direta",
                "category": "Energéticos & Gelo",
                "description": "10 Fardos Red Bull (Tradicional, Tropical, Melancia e Coco) + 200 unid Gelo de Água de Coco",
                "qty": 10,
                "unit": "fardos",
                "totalCost": 780.00,
                "paymentMethod": "Boleto / PIX",
                "status": "pago",
            },
        ],
        "employees": [
            {"id": "FUNC-01", "name": "Carlos Eduardo (Cadu)", "role": "Gerente Geral & Caixa", "shift": "Terça a Domingo (16h - 03h)", "phone": "(11) 99812-4410", "baseSalary": 2800.00, "bonuses": 350.00, "advances": 0.00, "paymentType": "Mensalista", "status": "ativo", "paidThisMonth": True},
            {"id": "FUNC-02", "name": "Matheus 'Sheik' Rocha", "role": "Roshzeiro Master (Tabacaria & Narguilé)", "shift": "Terça a Domingo (18h - 04h)", "phone": "(11) 99741-8821", "baseSalary": 2100.00, "bonuses": 420.00, "advances": 150.00, "paymentType": "Fixo + Comissão Rosh", "status": "ativo", "paidThisMonth": True},
            {"id": "FUNC-03", "name": "Leonardo Mixologista", "role": "Bartender Chefe (Drinks & Combos)", "shift": "Quarta a Domingo (18h - 04h)", "phone": "(11) 99104-3390", "baseSalary": 2200.00, "bonuses": 380.00, "advances": 0.00, "paymentType": "Fixo + 10% Bar", "status": "ativo", "paidThisMonth": True},
            {"id": "FUNC-04", "name": "Dona Márcia Gourmet", "role": "Chef de Cozinha (Chapas & Porções)", "shift": "Terça a Domingo (17h - 02h)", "phone": "(11) 98822-1190", "baseSalary": 2400.00, "bonuses": 250.00, "advances": 200.00, "paymentType": "Mensalista", "status": "ativo", "paidThisMonth": True},
            {"id": "FUNC-05", "name": "Bruno Atendimento VIP", "role": "Garçom Camarotes & Salão", "shift": "Quinta a Domingo (18h - 04h)", "phone": "(11) 99451-6700", "baseSalary": 1650.00, "bonuses": 490.00, "advances": 100.00, "paymentType": "Fixo + Gorjeta 10%", "status": "ativo", "paidThisMonth": True},
            {"id": "FUNC-06", "name": "Marcos Segurança", "role": "Segurança & Recepção Portaria", "shift": "Sexta a Domingo (19h - 04h)", "phone": "(11) 99311-0092", "baseSalary": 1400.00, "bonuses": 0.00, "advances": 0.00, "paymentType": "Diária / Fim de Semana", "status": "ativo", "paidThisMonth": False},
        ],
        "fixedExpenses": [
            {"id": "FIX-01", "name": "Aluguel do Ponto Comercial Imperador", "category": "Infraestrutura", "dueDate": "Dia 10", "amount": 3500.00, "status": "pago", "notes": "Contrato Comercial Salão + Deck"},
            {"id": "FIX-02", "name": "Energia Elétrica Trifásica (Cervejeiras, Ar, Som & Iluminação LED)", "category": "Utilidades", "dueDate": "Dia 15", "amount": 1180.00, "status": "pago", "notes": "Fatura mensal"},
            {"id": "FIX-03", "name": "Água, Esgoto & Gás Industrial Cozinha", "category": "Utilidades", "dueDate": "Dia 18", "amount": 460.00, "status": "pago", "notes": "Sabesp + Recarga cilindro GLP P45"},
            {"id": "FIX-04", "name": "Internet Fibra 1Gbps Dedicada (Wi-Fi Clientes + Tablets PIX)", "category": "Tecnologia", "dueDate": "Dia 20", "amount": 199.90, "status": "pago", "notes": "Link principal + roteador Mesh"},
            {"id": "FIX-05", "name": "Contabilidade, Alvará & Taxas Municipais", "category": "Jurídico & Contábil", "dueDate": "Dia 25", "amount": 450.00, "status": "pendente", "notes": "Honorários contábeis + Simples Nacional"},
            {"id": "FIX-06", "name": "Marketing Instagram (@imperadorloungebar) & Fotógrafo Fim de Semana", "category": "Marketing & Eventos", "dueDate": "Dia 05", "amount": 600.00, "status": "pago", "notes": "Tráfego pago regional + Reels do Lounge"},
        ],
        "historicalRevenueAdjustment": {
            "previousDaysRevenue": 24850.00,
            "previousDaysOrdersCount": 142,
            "previousDaysPixTotal": 16400.00,
            "previousDaysCardTotal": 6950.00,
            "previousDaysCashTotal": 1500.00,
            "note": "Faturamento acumulado dos dias anteriores do mês vigente",
        },
    }


def inicializar_banco() -> None:
    """Cria a pasta data/ e inicializa o banco SQLite3 + arquivo JSON caso não existam."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_SQLITE_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS system_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute("SELECT state_json FROM system_state WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            estado_inicial = obter_dados_iniciais_imperador()
            if DB_JSON_PATH.exists():
                try:
                    estado_inicial = json.loads(DB_JSON_PATH.read_text(encoding="utf-8"))
                except Exception:
                    pass
            json_str = json.dumps(estado_inicial, ensure_ascii=False, indent=2)
            cursor.execute(
                "INSERT INTO system_state (id, state_json) VALUES (1, ?)",
                (json_str,),
            )
            DB_JSON_PATH.write_text(json_str, encoding="utf-8")
        conn.commit()


def ler_estado_completo() -> Dict[str, Any]:
    """Lê o estado completo do banco SQLite3 (com fallback automático para db.json)."""
    inicializar_banco()
    try:
        with sqlite3.connect(DB_SQLITE_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT state_json FROM system_state WHERE id = 1")
            row = cursor.fetchone()
            if row and row[0]:
                return json.loads(row[0])
    except Exception as exc:
        print(f"[AVISO] Erro ao ler SQLite: {exc}")

    if DB_JSON_PATH.exists():
        try:
            return json.loads(DB_JSON_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    return obter_dados_iniciais_imperador()


def salvar_estado_completo(novo_estado: Dict[str, Any]) -> bool:
    """Salva o estado completo simultaneamente no SQLite3 (imperador_lounge.db) e em data/db.json."""
    inicializar_banco()
    try:
        json_str = json.dumps(novo_estado, ensure_ascii=False, indent=2)
        with sqlite3.connect(DB_SQLITE_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO system_state (id, state_json, updated_at)
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (json_str,),
            )
            conn.commit()
        DB_JSON_PATH.write_text(json_str, encoding="utf-8")
        return True
    except Exception as exc:
        print(f"[ERRO] Falha ao salvar estado no SQLite: {exc}")
        return False


def calcular_resumo_financeiro_dre(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calcula em Python o Demonstrativo de Resultado do Exercício (DRE):
    Faturamento Bruto - (Tudo que Comprou + Folha de Funcionários + Gastos Fixos) = Lucro Líquido Real.
    """
    orders = state.get("orders", [])
    hist = state.get("historicalRevenueAdjustment", {})

    live_paid = 0.0
    live_open = 0.0
    live_pix = 0.0
    live_card = 0.0
    live_cash = 0.0

    for o in orders:
        val = float(o.get("total", 0.0) or 0.0)
        if o.get("paymentStatus") == "pago":
            live_paid += val
            pm = str(o.get("paymentMethod", "")).lower()
            if "pix" in pm:
                live_pix += val
            elif "cart" in pm:
                live_card += val
            else:
                live_cash += val
        else:
            live_open += val

    faturamento_bruto = float(hist.get("previousDaysRevenue", 0.0) or 0.0) + live_paid + live_open
    total_pix = float(hist.get("previousDaysPixTotal", 0.0) or 0.0) + live_pix
    total_compras = sum(float(p.get("totalCost", 0.0) or 0.0) for p in state.get("purchases", []))
    total_funcionarios = sum(
        float(e.get("baseSalary", 0.0) or 0.0) + float(e.get("bonuses", 0.0) or 0.0)
        for e in state.get("employees", [])
        if e.get("status") != "inativo"
    )
    total_gastos_fixos = sum(float(f.get("amount", 0.0) or 0.0) for f in state.get("fixedExpenses", []))

    custo_total_geral = total_compras + total_funcionarios + total_gastos_fixos
    lucro_liquido = faturamento_bruto - custo_total_geral
    margem_lucro = (lucro_liquido / faturamento_bruto * 100.0) if faturamento_bruto > 0 else 0.0

    return {
        "faturamentoBruto": round(faturamento_bruto, 2),
        "vendasPixTotal": round(total_pix, 2),
        "totalComprasMercadorias": round(total_compras, 2),
        "totalFolhaFuncionarios": round(total_funcionarios, 2),
        "totalGastosFixos": round(total_gastos_fixos, 2),
        "custoTotalOperacional": round(custo_total_geral, 2),
        "lucroLiquidoReal": round(lucro_liquido, 2),
        "margemLucroPercentual": round(margem_lucro, 2),
    }

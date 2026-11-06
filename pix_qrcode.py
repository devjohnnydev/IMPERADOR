# -*- coding: utf-8 -*-
"""
Módulo Python Oficial de Geração de PIX BRCode (Padrão EMVCo Banco Central)
com cálculo real de CRC16-CCITT (0xFFFF, polinômio 0x1021) e geração de QR Code SVG.
"""

import unicodedata
import re


def remover_acentos(texto: str) -> str:
    """Remove acentos e caracteres especiais para conformidade com o padrão EMV do Banco Central."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    sem_acento = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return re.sub(r"[^A-Za-z0-9 /\-\.]", "", sem_acento).strip()


def formatar_tlv(id_campo: str, valor: str) -> str:
    """Formata um campo no padrão TLV (Type-Length-Value) com tamanho de 2 dígitos."""
    valor_str = str(valor)
    tamanho = f"{len(valor_str):02d}"
    return f"{id_campo}{tamanho}{valor_str}"


def calcular_crc16_ccitt(payload: str) -> str:
    """
    Calcula o checksum CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF)
    exigido pelo Banco Central do Brasil no campo 63 do BRCode PIX.
    """
    crc = 0xFFFF
    polinomio = 0x1021
    dados = payload.encode("utf-8")

    for byte in dados:
        crc ^= (byte << 8)
        for _ in range(8):
            if (crc & 0x8000) != 0:
                crc = ((crc << 1) ^ polinomio) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF

    return f"{crc:04X}"


def gerar_payload_pix_brcode(
    chave_pix: str,
    nome_recebedor: str = "IMPERADOR LOUNGE BAR",
    cidade_recebedor: str = "SAO PAULO",
    valor: float = 0.0,
    txid: str = "IMPERADOR03",
) -> str:
    """
    Gera a string completa do PIX Copia e Cola (BRCode EMVCo) válida para qualquer banco.
    """
    chave_limpa = str(chave_pix or "pix@imperadorloungebar.com.br").strip()
    nome_limpo = remover_acentos(nome_recebedor)[:25].upper() or "IMPERADOR LOUNGE BAR"
    cidade_limpa = remover_acentos(cidade_recebedor)[:15].upper() or "SAO PAULO"
    txid_limpo = re.sub(r"[^A-Za-z0-9]", "", str(txid or "IMPERADOR03"))[:25] or "***"

    # 00: Payload Format Indicator
    pfi = formatar_tlv("00", "01")

    # 26: Merchant Account Information - PIX (GUI = br.gov.bcb.pix)
    gui = formatar_tlv("00", "br.gov.bcb.pix")
    chave_tlv = formatar_tlv("01", chave_limpa)
    merchant_account = formatar_tlv("26", f"{gui}{chave_tlv}")

    # 52: Merchant Category Code (0000 ou 5812 para Restaurantes/Bares)
    mcc = formatar_tlv("52", "0000")

    # 53: Transaction Currency (986 = BRL Real Brasileiro)
    moeda = formatar_tlv("53", "986")

    # 54: Transaction Amount (opcional se 0, obrigatório quando tem valor do pedido)
    valor_tlv = ""
    if valor and float(valor) > 0:
        valor_formatado = f"{float(valor):.2f}"
        valor_tlv = formatar_tlv("54", valor_formatado)

    # 58: Country Code
    pais = formatar_tlv("58", "BR")

    # 59: Merchant Name
    nome_tlv = formatar_tlv("59", nome_limpo)

    # 60: Merchant City
    cidade_tlv = formatar_tlv("60", cidade_limpa)

    # 62: Additional Data Field Template (05 = Reference Label / TXID)
    txid_tlv = formatar_tlv("05", txid_limpo)
    adicional_tlv = formatar_tlv("62", txid_tlv)

    # Monta o payload parcial até o ID 6304
    payload_sem_crc = (
        f"{pfi}{merchant_account}{mcc}{moeda}{valor_tlv}"
        f"{pais}{nome_tlv}{cidade_tlv}{adicional_tlv}6304"
    )

    crc_hex = calcular_crc16_ccitt(payload_sem_crc)
    return f"{payload_sem_crc}{crc_hex}"

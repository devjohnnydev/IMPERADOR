# IMPERADOR LOUNGE BAR — Sistema Completo (Site, Cardápio QR, Tablet PIX, Chat IA, Modo TV & ERP)

Sistema completo em **Python** (com suporte a **SQLite3 local** e **PostgreSQL / Railway** via `DATABASE_URL`) para gestão integrada do **Imperador Lounge Bar**:

## 🚀 Módulos do Sistema

1. **🏠 Site Principal & Home (`/?view=home`)**
   - Vitrine moderna com carrossel, eventos da semana, galeria, localização e integração direta com o Cardápio Digital.
2. **📱 Cardápio Digital QR Code (`/?view=menu`)**
   - Inspirado no padrão Tagme Menu: categorias de Destaques, Tabacaria & Narguilé (Rosh), Combos & Garrafas VIP, Drinks Autorais, Cervejas & Baldes, Porções & Chapas, Burgers e Sobremesas.
   - Disponibilidade automática vinculada ao estoque real (itens sem insumo ficam indisponíveis automaticamente).
   - Chamados rápidos de **Garçom** e **Troca de Carvão / Rosh**.
3. **🖥️ Modo Tablet na Mesa com PIX QR Code (`/?view=tablet`)**
   - Terminal de autoatendimento para mesas e camarotes com geração de **QR Code PIX Oficial (BRCode EMVCo + CRC16-CCITT)** e envio direto para preparo.
   - Controle e autorização de dispositivos/tablets via IAM no painel administrativo.
4. **💬 Pedido pelo Chat Inteligente (`chat.js` / `chat_pedido.py`)**
   - Atendimento automatizado na mesa com reconhecimento de itens do cardápio, montagem de carrinho e confirmação de pedido.
5. **📺 Modo TV — Ranking & Vendas ao Vivo (`/?view=tv`)**
   - Painel de TV em tempo real com ranking de vendedores/garçons, animações de vendas e alertas de metas.
6. **👑 Painel Administrador & ERP Modular (`/?view=admin`)**
   - **Controle de Acesso (IAM)**: Usuários, perfis de permissão por módulo (`none`, `view`, `use`, `edit`), sessões ativas e dispositivos conectados.
   - **Compras, Pedidos de Compra & Recebimento de Notas**: Emissão de pedido ao fornecedor, conferência cega no recebimento e aprovação gerencial/financeira.
   - **Estoque em 3 Camadas (Depósito ➔ Bar ➔ Em Uso)** + **Inventário Completo**: Transferências, abertura de garrafas/embalagens em doses/g/ml, ficha técnica e baixa automática a cada venda.
   - **Produtos & Formação de Preços**: Ficha técnica detalhada, cálculo de custo por dose/porção, markup alvo e sugestão de preço de venda.
   - **Comissões & Equipe**: Regras de comissão por vendedor/garçom, metas e folha de funcionários.
   - **Financeiro & DRE Automático**: Cálculo em tempo real de `Faturamento Bruto - (Compras + Folha + Gastos Fixos) = Lucro Líquido Real`.
   - **📸 Site ➔ Instagram & Facebook Auto-Post**: Publicação simultânea no mural/stories do site, geração de artes `1080x1080` (Feed) e `1080x1920` (Stories) e integração com Meta Graph API / Webhook.

---

## ▶️ Como Executar Localmente

1. Clique duas vezes em `INICIAR_PYTHON.bat` ou execute no terminal:
   ```bash
   python app.py
   ```
2. Acesse no navegador:
   - **Sistema Principal**: `http://localhost:8000`
   - **Login Padrão do Administrador**: usuário `admin` / senha `imperador123` (o sistema solicitará a troca no primeiro acesso).

## ☁️ Deploy em Produção (Railway / PostgreSQL)
- Configure a variável de ambiente `DATABASE_URL` apontando para o banco PostgreSQL. O módulo `storage.py` criará automaticamente todas as tabelas relacionais e índices na inicialização.

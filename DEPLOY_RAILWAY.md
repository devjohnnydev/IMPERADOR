# Deploy no Railway (PostgreSQL)

## 1. Criar os serviços
1. No Railway, crie um projeto a partir deste repositório do GitHub.
2. No mesmo projeto, adicione um banco: **New → Database → PostgreSQL**.
3. O Railway usa o `Dockerfile` deste repositório (definido em `railway.json`).

## 2. Variáveis do serviço do sistema (aba Variables)
| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência ao banco) |
| `ADMIN_INITIAL_PASSWORD` | senha inicial do usuário `admin` (mín. 8 caracteres) |
| `TZ` | `America/Sao_Paulo` (já vem no Dockerfile) |

Sem `ADMIN_INITIAL_PASSWORD`, a senha inicial é `imperador123` — troque-a no primeiro acesso.

## 3. Criar as tabelas
O sistema cria as tabelas sozinho na primeira inicialização. Se preferir criar antes, escolha **um** dos caminhos:

- **Pelo console do Railway:** abra o PostgreSQL → **Data → Query** e cole o conteúdo de `schema.sql`.
- **Pelo seu computador** (usa a URL pública do banco: PostgreSQL → Variables → `DATABASE_PUBLIC_URL`):
  ```bash
  pip install psycopg2-binary
  python criar_tabelas.py --url "COLE_A_DATABASE_PUBLIC_URL"              # só as tabelas
  python criar_tabelas.py --url "COLE_A_DATABASE_PUBLIC_URL" --importar   # tabelas + dados deste computador
  python criar_tabelas.py --url "COLE_A_DATABASE_PUBLIC_URL" --dados-iniciais  # tabelas + cardápio de exemplo
  ```
  `--importar` leva o cardápio, pedidos, estoque, notas, usuários (com as mesmas senhas) e as fotos de `public/uploads`.

Para regenerar o `schema.sql` depois de mudar `storage.py`: `python criar_tabelas.py --sql`.

## 4. Conferir
- `https://SEU-DOMINIO/api/health` deve responder `"storage": "PostgreSQL"`.
- Entre em `https://SEU-DOMINIO/?view=admin`.

## Observações
- Mantenha **1 réplica** do serviço (o sistema guarda o estado em memória para responder rápido).
- Fotos enviadas pelo painel ficam na tabela `media` (o disco do Railway é apagado a cada deploy).
- Cada novo deploy reinicia o servidor: quem estiver logado precisa entrar de novo (inclusive a TV).

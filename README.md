# Meu Controle V3

## Arquivos

- `index.html`: estrutura do aplicativo.
- `style.css`: visual.
- `app.js`: login, sincronização, migração da V2 e operações financeiras.
- `manifest.json`: instalação como aplicativo.
- `sw.js`: cache básico do PWA.
- `schema_supabase.sql`: estrutura e políticas do Supabase.

## Publicação no GitHub Pages

1. Abra o repositório `meu-controle`.
2. Envie todos os arquivos deste pacote para a raiz do repositório.
3. Substitua os arquivos antigos quando o GitHub perguntar.
4. Faça o commit.
5. Aguarde a publicação do GitHub Pages.
6. Abra o site e pressione `Ctrl + F5`.

## Supabase

O `app.js` já está configurado com a URL e a chave pública informadas anteriormente.

A chave pública do Supabase pode ficar no navegador. A proteção real depende das políticas RLS do banco.

Execute `schema_supabase.sql` no SQL Editor apenas se as tabelas ou políticas ainda não estiverem corretas.

## Migração da V2

A migração ocorre automaticamente após o primeiro login.

O aplicativo procura dados locais nas chaves:

- `meu_controle_v2_local`
- `meu-controle-v2`
- `meuControleV2`
- `financeData`
- `meu_controle_data`

Depois da migração, o navegador grava uma marca para não repetir o processo na mesma conta.

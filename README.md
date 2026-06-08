# 🎵 Louvores — Gestão de Repertório

Sistema para gerenciar músicas, tons e ministrantes da sua equipe de louvor.

---

## 🚀 Como configurar (passo a passo)

### 1. Configurar o Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Crie um novo projeto
3. No menu lateral, vá em **SQL Editor**
4. Cole o conteúdo do arquivo `supabase-setup.sql` e clique em **Run**
5. Vá em **Project Settings → API** e copie:
   - **Project URL** → algo como `https://xyzabcdef.supabase.co`
   - **anon / public key** → chave longa que começa com `eyJ...`

---
 
### 2. Subir no GitHub

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

---

### 3. Deploy no Vercel

1. Acesse [vercel.com](https://vercel.com) e conecte seu GitHub
2. Importe o repositório
3. Antes de fazer o deploy, vá em **Environment Variables** e adicione:

| Nome da variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://xyzabcdef.supabase.co` |
| `SUPABASE_KEY` | `eyJhbGciOiJIUzI1NiIs...` |

4. Clique em **Deploy** ✓

> **⚠️ Importante:** Nunca coloque suas chaves diretamente no código e nem faça commit delas. Sempre use variáveis de ambiente no Vercel.

---

### 4. Configurar as variáveis no Vercel para o app web

Como este é um site estático (HTML puro, sem Node.js), as variáveis de ambiente do Vercel **não chegam automaticamente ao JavaScript do browser**. 

Para injetar as variáveis, crie um arquivo `vercel.json` na raiz do projeto com os rewrites e um endpoint, **OU** use a abordagem mais simples: 

**Opção simples — edite o `config.js` diretamente antes do deploy:**
```js
const CONFIG = {
  SUPABASE_URL: "https://SUA-URL.supabase.co",
  SUPABASE_KEY: "SUA-CHAVE-AQUI",
  TABLE_NAME: "musicas",
};
```

**Opção avançada — Vercel com Edge Function** (para nunca expor as chaves no repositório, fale com o desenvolvedor para adicionar um proxy).

---

## 🎨 Ministrantes disponíveis

- Raphaela
- Daniela
- Cris
- Mirian
- Pr. Humberto

Para adicionar mais ministrantes, edite as opções em `index.html` (nos dois `<select>` de ministrante) e no objeto `MINISTRANTE_CORES` em `app.js`.

---

## 📁 Estrutura de arquivos

```
louvor-app/
├── index.html          → Estrutura da página
├── style.css           → Estilos visuais
├── app.js              → Lógica e comunicação com Supabase
├── config.js           → ⚙️ CONFIGURAÇÕES (URL e chave do Supabase)
├── supabase-setup.sql  → SQL para criar a tabela no Supabase
└── README.md           → Este arquivo
```

---

## 🛠 Como usar

- **Adicionar música:** clique em "+ Nova Música", preencha nome, tom e ministrante
- **Editar:** passe o mouse sobre o card e clique no ✏️
- **Excluir:** passe o mouse sobre o card e clique no 🗑️
- **Filtrar:** use a barra de busca ou os filtros de ministrante/tom

# RDO Digital — versão instalável

Este pacote é um app instalável de verdade (PWA): depois de publicado, você adiciona um ícone na tela do celular e ele abre direto, sem precisar do Claude.

Duas contas gratuitas são necessárias (nenhuma pede cartão de crédito):
- **Firebase** → guarda os dados do RDO, compartilhados entre toda a equipe
- **GitHub** → hospeda os arquivos do app e gera o link de acesso

Leva uns 15-20 minutos, uma única vez.

---

## Parte 1 — Criar o banco de dados (Firebase)

1. Acesse **https://console.firebase.google.com** e entre com uma conta Google.
2. Clique em **"Criar projeto"**. Dê um nome (ex: `rdo-camila-furtado`) e siga o assistente (pode desativar o Google Analytics, não é necessário).
3. Dentro do projeto, clique no ícone **`</>`** ("Adicionar app da Web").
   - Dê um apelido ao app (ex: "RDO Digital") e clique em registrar.
   - Você verá um bloco de código com um objeto `firebaseConfig = {...}`. **Copie esse bloco inteiro.**
4. Abra o arquivo **`firebase-config.js`** (está nesta mesma pasta) e substitua o conteúdo pelas chaves que você copiou, mantendo o nome `const firebaseConfig = {...}`.
5. No menu lateral esquerdo do Firebase, vá em **Build > Firestore Database** → **"Criar banco de dados"**.
   - Escolha a localização mais próxima (ex: `southamerica-east1`).
   - Escolha **"Iniciar em modo de produção"**.
6. Depois de criado, vá na aba **"Regras"** (Rules) do Firestore e substitua pelo conteúdo abaixo, depois clique em **"Publicar"**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ **Atenção de segurança:** essa regra libera leitura/escrita para qualquer pessoa que descobrir a URL do seu projeto Firebase (não a URL do app — a URL do banco de dados, que não é divulgada publicamente). Isso é aceitável para uma ferramenta interna pequena, mas **não é criptografado nem protegido por senha**. Se no futuro quiser mais segurança, me avise que ajudamos a adicionar um login simples (Firebase Authentication).

---

## Parte 2 — Publicar o app (GitHub Pages)

1. Acesse **https://github.com** e crie uma conta gratuita, se ainda não tiver.
2. Clique em **"New repository"** (Novo repositório).
   - Nome: `rdo-digital` (ou o que preferir)
   - Marque como **Public**
   - Clique em **"Create repository"**
3. Na página do repositório recém-criado, clique em **"uploading an existing file"** (ou "Add file > Upload files").
4. Arraste **todos os arquivos desta pasta** para a área de upload:
   - `index.html`
   - `app.jsx`
   - `firebase-config.js` (já editado com suas chaves)
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
5. Clique em **"Commit changes"** para salvar.
6. Vá em **Settings** (do repositório) → **Pages** (menu lateral).
   - Em "Source", escolha **"Deploy from a branch"**
   - Branch: **main**, pasta: **/ (root)**
   - Clique em **Save**.
7. Aguarde 1-2 minutos. A página vai te dar um link parecido com:
   `https://SEU-USUARIO.github.io/rdo-digital/`

Esse é o link definitivo do seu app.

---

## Parte 3 — Instalar no celular

1. Abra o link acima no navegador do celular (Chrome no Android, Safari no iPhone).
2. Toque no menu do navegador (⋮ ou compartilhar) → **"Adicionar à tela de início"**.
3. Um ícone do RDO Digital vai aparecer na tela do celular, como um app normal.
4. Repita esse passo em cada celular da equipe que for usar.

Todos que instalarem vão enxergar os mesmos registros, porque os dados ficam no Firebase, não no celular.

---

## Atualizações futuras

Se no futuro eu (Claude) precisar mudar algo no app, vou te passar os arquivos atualizados — é só repetir o upload deles no mesmo repositório do GitHub (Add file > Upload files, sobrescrevendo os existentes) que o link e o ícone já instalado se atualizam sozinhos.

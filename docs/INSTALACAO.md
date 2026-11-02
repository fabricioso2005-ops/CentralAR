# Central de Atendimento AR: instalação do app

O app fica na pasta `app/`. Ele é um site estático que pode ser **instalado no celular** como aplicativo (PWA).
Os dados ficam no **Supabase**: banco PostgreSQL com login por e-mail e senha.

- Cada **gerente comercial** entra com o próprio e-mail e senha e vê **só a própria base**: imobiliárias, corretores, contatos e visitas.
- O **gestor** vê e edita a base de todos, transfere parceiros entre gerentes, importa planilhas e ativa ou desativa usuários.
- Essas regras ficam **no banco** (Row Level Security), não só na tela. Mesmo alguém mexendo no código do app não consegue ler a base de outro gerente.

---

## 1. Criar o projeto no Supabase (grátis)

1. Acesse https://supabase.com e crie uma conta.
2. **New project**: nome `central-ar`, região **South America (São Paulo)**. Crie uma senha forte para o banco e guarde-a.
3. Quando o projeto estiver pronto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.

## 2. Configurar o login

Em **Authentication → Sign In / Providers → Email**:

- **Desligue "Allow new users to sign up"**. Assim só o gestor cria contas, e ninguém de fora se cadastra sozinho.
- Deixe **Email** habilitado.

Em **Authentication → URL Configuration**:

- **Site URL**: o endereço onde o app vai ficar (passo 4), por exemplo `https://central-ar.netlify.app`.
- **Redirect URLs**: adicione o mesmo endereço. Os links de "esqueci minha senha" e de convite voltam para ele.

## 3. Ligar o app ao projeto

1. No Supabase, abra **Project Settings → API** e copie:
   - **Project URL** (ex.: `https://abcdxyz.supabase.co`)
   - **anon public** key
2. No arquivo `app/config.js`, troque os dois valores:

```js
window.AR_CONFIG = {
  supabaseUrl: 'https://abcdxyz.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  fusoHorario: 'America/Sao_Paulo'
};
```

A chave **anon public** pode ficar no app. Quem protege os dados são as regras do banco.
**Nunca** coloque a chave `service_role` no app.

## 4. Publicar o app

Escolha uma opção (todas gratuitas):

- **Netlify (mais simples):** em https://app.netlify.com/drop, arraste a pasta `app/`. Você recebe um endereço `https://….netlify.app`.
- **Vercel ou Netlify ligados ao GitHub:** importe este repositório e defina **Root directory / Base directory = `app`**, sem comando de build. Cada `git push` atualiza o app.

Depois de publicar, volte ao passo 2 e confira a **Site URL**.

## 5. Criar os usuários

1. No Supabase, abra **Authentication → Users → Add user**:
   - **Create new user**: informe o e-mail e uma senha inicial e marque **Auto Confirm User**. Envie o login e o link do app para o gerente.
   - ou **Send invitation**: o gerente recebe um e-mail, clica no link e cria a própria senha no app.
2. Para dar nome ao usuário, preencha em **User Metadata** `{"nome": "Ana Lima"}`. O próprio usuário também pode ajustar o nome em **Minha conta**.
3. **Primeiro gestor:** depois de criar o seu usuário, rode no SQL Editor:

```sql
update public.perfis set papel = 'gestor' where email = 'seu-email@ar.com.br';
```

Daqui para a frente, a aba **Equipe** do app permite tornar outros usuários gestores, ou desativar quem saiu da empresa.
A base de um usuário desativado continua guardada, e o gestor pode transferir os parceiros dele para outro gerente.

## 6. Instalar no celular

- **Android (Chrome):** abra o endereço do app, toque no menu ⋮ e depois em **Instalar app**.
- **iPhone (Safari):** abra o endereço do app, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.

## 7. Importar a planilha de corretores e imobiliárias

Na aba **Equipe** (só o gestor vê), use **Importar planilha** com um arquivo CSV (no Excel: *Salvar como → CSV UTF-8*).
As colunas reconhecidas são:

| coluna | conteúdo |
|---|---|
| `nome` | nome da imobiliária ou do corretor (obrigatória) |
| `tipo` | `imobiliária` ou `corretor` |
| `telefone` | WhatsApp ou telefone |
| `email`, `cidade`, `creci`, `responsavel` | opcionais |
| `imobiliaria` | para corretores: nome da imobiliária a que estão vinculados |
| `gerente` | e-mail ou nome do gerente comercial dono daquele contato |

Linhas sem gerente, ou com um gerente que não existe no app, vão para o gerente escolhido na tela.

## Lembretes de visita

Cada visita tem dois botões:

- **Salvar no calendário do celular**: baixa um arquivo `.ics` com os alarmes escolhidos (15 min, 1 h, 1 dia antes). Ao abrir o arquivo, o calendário do celular (Google Agenda, Calendário do iPhone ou Outlook) salva o evento com os alarmes.
- **Google Agenda**: abre o evento já preenchido no Google Agenda.

## Estrutura do banco

| tabela | o quê |
|---|---|
| `perfis` | um por usuário: nome, e-mail, papel (`gerente`/`gestor`), ativo |
| `parceiros` | imobiliárias e corretores; `dono` = gerente; corretor pode apontar para a sua imobiliária |
| `contatos` | histórico de conversas de cada parceiro |
| `visitas` | visitas agendadas, com status e alarmes |

Backups: o Supabase faz backups diários automáticos. Para exportar, abra **Table Editor**, escolha a tabela e use **Export to CSV**.

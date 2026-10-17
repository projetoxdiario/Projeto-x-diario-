# Projeto X Diário — versão online (base inicial)

Este projeto aproveita o HTML existente do **Projeto X Diário** (visual preto/verde, treinos em casa, corrida, check-ins de peso/cintura, desafio de 15 dias e área do criador) e acrescenta a camada de autenticação e sincronização com Supabase.

## O que está preparado

- Login com e-mail e senha.
- Cadastro de participantes somente com código de convite.
- Dados pessoais (treinos concluídos, corridas e check-ins) sincronizados por conta.
- Políticas RLS no banco para separar os dados de cada participante.
- Perfil de criador, com edição do desafio/treinos, criação de convites e ativação/desativação de participantes.
- Hospedagem estática pronta para Vercel.

**Ainda é necessário ligar este código ao seu projeto Supabase e publicar o site.** Até concluir os passos abaixo, o aplicativo não está online e não deve ser divulgado aos participantes. A chave `anon`/`publishable` do Supabase é pública por desenho; nunca coloque uma chave `service_role` neste site.

## Arquivos

- `index.html` — interface original, adaptada para pedir login.
- `app.js` — autenticação, carregamento/sincronização e administração online.
- `config.example.js` — modelo das configurações públicas do Supabase.
- `supabase/schema.sql` — tabelas, funções, trigger de convite e políticas de segurança.
- `vercel.json` — configuração mínima para hospedagem estática.

## Passo 1 — criar o banco Supabase

1. Acesse [Supabase](https://supabase.com/) e crie uma conta/projeto no plano gratuito.
2. Guarde a senha do banco em local seguro; não a coloque no código.
3. No projeto, abra **SQL Editor → New query**.
4. Abra `supabase/schema.sql` deste pacote, copie todo o conteúdo, cole no SQL Editor e clique em **Run**.
5. No SQL Editor, crie o convite inicial para sua própria conta, executando:

```sql
insert into public.invite_codes (code, max_uses, uses, is_active)
values ('PX-PRIMEIRO-ACESSO', 1, 0, true);
```

Esse código inicial é de uso único. Depois de virar criador, gere convites dentro do próprio aplicativo.

## Passo 2 — configurar a URL e a chave pública

1. No Supabase, abra **Project Settings → API** (em algumas versões aparece como **Data API**).
2. Copie a **Project URL** e a chave pública **anon/public** ou **publishable**. Não copie `service_role`/`secret`.
3. Na pasta do projeto, faça uma cópia de `config.example.js` com o nome `config.js`.
4. Edite `config.js` e substitua os dois valores de exemplo pela URL e chave pública do seu projeto.
5. O `config.js` precisa estar incluído no repositório do site para que a versão estática consiga carregar as configurações. URL e chave pública não são senhas; a proteção vem das políticas RLS no `schema.sql`.

## Passo 3 — colocar os arquivos no GitHub

1. Crie uma conta em [GitHub](https://github.com/) se ainda não tiver.
2. Crie um repositório novo, por exemplo `projeto-x-diario`. Se quiser manter o repositório privado, pode fazê-lo.
3. Envie para a raiz do repositório os arquivos `index.html`, `app.js`, `config.js`, `vercel.json` e a pasta `supabase/`. O `README.md` também pode ser enviado.
4. Não envie senhas pessoais, senha do banco nem qualquer chave `service_role`.

## Passo 4 — publicar na Vercel

1. Acesse [Vercel](https://vercel.com/) e entre usando sua conta GitHub.
2. Clique em **Add New → Project**, selecione o repositório `projeto-x-diario` e importe-o.
3. Como é um site estático, não precisa de comando de build; se a Vercel pedir, deixe **Build Command** vazio e use a raiz do repositório como **Root Directory**.
4. Clique em **Deploy**. A Vercel fornecerá um endereço `https://...vercel.app`.
5. Teste o link no celular e em uma janela anônima. Não convide participantes ainda até concluir os passos de configuração e o teste do criador.

## Passo 5 — ajustar autenticação no Supabase

1. No Supabase, abra **Authentication → URL Configuration**.
2. Configure **Site URL** com o endereço real da Vercel, incluindo `https://`.
3. Inclua esse mesmo endereço na lista de **Redirect URLs** permitidas.
4. A confirmação de e-mail pode ficar ativada (recomendado). Se estiver ativada, depois do cadastro o usuário precisa clicar no link que receber por e-mail e só então entrar no app.

## Passo 6 — criar sua conta de criador

1. Abra o site publicado na Vercel.
2. Escolha **Primeiro acesso? Criar conta com convite**.
3. Use o e-mail que será sua conta administrativa e o convite `PX-PRIMEIRO-ACESSO`.
4. Se o Supabase pedir confirmação, confirme pelo e-mail e entre no site.
5. No Supabase, abra **SQL Editor** e promova apenas sua própria conta a criador, substituindo o e-mail abaixo pelo e-mail exato que você cadastrou:

```sql
update public.profiles
set role = 'creator'
where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');
```

6. Saia e entre novamente no app. Deve aparecer a aba **Criador**. Nela, teste editar/salvar o nome do desafio, gerar um convite e conferir a lista de participantes.

## Passo 7 — convidar participantes

1. Na aba **Criador → Administração online**, clique em **Gerar código de convite**.
2. Envie o código a uma pessoa por um canal privado. Cada código é para um cadastro.
3. A pessoa abre o link da Vercel, cria a conta com o código e confirma o e-mail se solicitado.
4. Os registros pessoais ficam associados à conta dela. Desativar um participante bloqueia novos acessos após a sessão ser renovada/encerrada; para maior rigor operacional, peça à pessoa para sair e entrar novamente depois de uma desativação.

## Como publicar atualizações depois

Edite os arquivos no repositório GitHub e envie um commit. A Vercel fará um novo deploy automaticamente. Alterações de treinos/configurações feitas na área do criador são salvas no Supabase e não precisam de novo deploy.

## Checklist de teste antes de convidar amigos

- [ ] Entrar e sair funciona.
- [ ] Um código inválido não permite cadastrar.
- [ ] Dois usuários diferentes não veem os registros um do outro.
- [ ] Um participante não vê a aba Criador.
- [ ] O criador salva uma alteração de treino e ela aparece após atualizar em outro navegador.
- [ ] O criador consegue gerar e desativar convites.
- [ ] O criador consegue desativar um participante.
- [ ] Nunca foi usada/exposta uma chave `service_role` no navegador ou GitHub.

## Observações importantes

- Esta é uma base inicial para publicação; faça os testes acima antes de tratar como pronta para uso amplo.
- O painel de criador administra convites, participantes e configurações/treinos. A área de progresso pessoal continua sendo de cada conta.
- O banco armazena registros de treino, corrida e check-ins corporais. Compartilhe o link apenas com pessoas que entendam quais dados serão registrados.
- O plano gratuito pode ter limites e políticas de inatividade que mudam com o tempo; consulte os painéis de Supabase e Vercel antes de depender do serviço para uso crítico.

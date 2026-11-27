-- Etapa 17, onda 5b (26/11/2026): bucket PRIVADO `acn-privado` para o que não pode ter endereço público: os anexos do chat e as assinaturas de clientes e de funcionários.
-- Por que: o bucket `acn-media` é público, ou seja, qualquer pessoa com o endereço de um arquivo (e o endereço de um arquivo do chat aparece no navegador de quem o abre)
-- lê o arquivo sem entrar no sistema. Chat privado (onda 4a) e assinatura (nome, rubrica e documento de gente de fora) não combinam com isso.
-- Esta parte só ACRESCENTA: o `acn-media` não muda; os arquivos antigos continuam onde estão até o script `ferramentas/migrar_bucket/migrar_para_privado.cjs` copiá-los
-- (e, só no fim, e só com o OK do usuário, apagar os originais públicos).
-- Regras do bucket: ler e enviar, só quem entrou; na pasta `chat/<sala>/…` só os membros da sala (nem o Admin lê conversa alheia, decisão do usuário em 26/11/2026);
-- ninguém altera nem apaga pelo navegador (o "apagar anexo" do chat só marca a mensagem). A chave pública não vê nada.
-- Decidido com o usuário em 26/11/2026: nesta onda só chat e assinaturas; as demais pastas (licitações, CRM, compras…) viram um plano próprio, pasta por pasta.
-- Como desfazer: etapa17_onda5b_reverter.sql.

insert into storage.buckets (id, name, public, file_size_limit)
values ('acn-privado', 'acn-privado', false, 20971520)
on conflict (id) do nothing;

create policy "acn-privado logado le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'acn-privado'
    and (select public.esta_logado())
    and (
      (storage.foldername(name))[1] is distinct from 'chat'
      or (storage.foldername(name))[2] in (select s::text from public.chat_minhas_salas() s)
    )
  );

create policy "acn-privado logado envia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'acn-privado'
    and (select public.esta_logado())
    and (
      (storage.foldername(name))[1] is distinct from 'chat'
      or (storage.foldername(name))[2] in (select s::text from public.chat_minhas_salas() s)
    )
  );

-- 0011: fotos da brassagem (seção Notas da receita), 23/11/2026.
-- Arquivos no Storage, bucket PRIVADO "fotos-brassagem", caminho <dono>/<receita>/<arquivo>.jpg.
-- O portal reduz a foto antes de enviar (lado maior até 1600 px, JPEG, alvo ~300 kB). O bucket recusa o que passar
-- de 400 kB ou não for JPEG: quem enviar sem reduzir é barrado pelo próprio Storage.
-- Limites (o plano Free tem 1 GB): 12 fotos por receita e 500 por usuário.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-brassagem', 'fotos-brassagem', false, 409600, array['image/jpeg']);

-- Conta as fotos de quem chama. Security definer é inevitável aqui: a política de storage.objects não pode consultar
-- a própria tabela (recursão). Só enxerga a pasta do próprio usuário.
create function public.fotos_cabem(p_receita text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 500
     and count(*) filter (where (storage.foldername(o.name))[2] = p_receita) < 12
  from storage.objects o
  where o.bucket_id = 'fotos-brassagem'
    and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;

revoke execute on function public.fotos_cabem(text) from public, anon;
grant execute on function public.fotos_cabem(text) to authenticated;

-- Ler: as minhas, ou as de receita que eu enxergo (a RLS de receitas vale: só a pública de outro dono).
create policy fotos_brassagem_ler on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos-brassagem'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.receitas r
        where r.id::text = (storage.foldername(name))[2]
          and r.dono::text = (storage.foldername(name))[1]
      )
    )
  );

-- Enviar: só na minha pasta, numa receita minha, dentro dos limites.
create policy fotos_brassagem_enviar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-brassagem'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.receitas r
      where r.id::text = (storage.foldername(name))[2]
        and r.dono = (select auth.uid())
    )
    and public.fotos_cabem((storage.foldername(name))[2])
  );

-- Apagar: o que está na minha pasta (inclusive foto de receita já excluída). Sem política de update: foto não se troca.
create policy fotos_brassagem_apagar on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos-brassagem'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

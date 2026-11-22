"""Grava no GaliaBrew as receitas geradas pelo converter.mjs, como o próprio usuário (a RLS vale).

Uso:
  python ferramentas/brewfather/importar.py <receitas.json> --email voce@exemplo.com [--gravar]

Sem --gravar é simulação: faz tudo e desfaz no fim (ROLLBACK). Com --gravar, confirma.
Uma transação só: se uma receita falhar, nada é gravado. Receita já importada (mesmo extras.brewfather_id) é pulada.

Senha do banco: variável de ambiente GALIABREW_DB_SENHA (nunca no repositório).
PowerShell:  $env:GALIABREW_DB_SENHA = Read-Host -MaskInput "Senha do banco"
Requer: pip install "psycopg[binary]"
"""
import argparse
import json
import os
import sys

import psycopg

REF = "hzomsyfujxakcuaaedmh"
HOST = "aws-1-sa-east-1.pooler.supabase.com"   # pooler de sessão do projeto GaliaBrew (sa-east-1)

ap = argparse.ArgumentParser()
ap.add_argument("receitas")
ap.add_argument("--email", required=True, help="e-mail do login dono das receitas")
ap.add_argument("--gravar", action="store_true", help="confirma a gravação (sem isto, só simula)")
args = ap.parse_args()

senha = os.environ.get("GALIABREW_DB_SENHA")
if not senha:
    sys.exit("Defina GALIABREW_DB_SENHA com a senha do banco do projeto GaliaBrew.")

receitas = json.load(open(args.receitas, encoding="utf-8"))

with psycopg.connect(host=HOST, port=5432, dbname="postgres", user=f"postgres.{REF}", password=senha,
                     sslmode="require", connect_timeout=15) as conn:
    with conn.cursor() as cur:
        cur.execute("select id from auth.users where lower(email) = lower(%s)", (args.email,))
        linha = cur.fetchone()
        if not linha:
            sys.exit(f"Nenhum login com o e-mail {args.email}.")
        user_id = str(linha[0])

        # Estilos do catálogo (dono nulo) por nome, lidos antes de trocar de papel.
        cur.execute("select nome, id from public.estilos where dono is null")
        estilos = {nome: str(i) for nome, i in cur.fetchall()}

        # A partir daqui, como o usuário logado: salvar_receita e RLS valem como no portal.
        cur.execute("select set_config('request.jwt.claims', %s, true)",
                    (json.dumps({"sub": user_id, "role": "authenticated"}),))
        cur.execute("set local role authenticated")

        cur.execute("select extras->>'brewfather_id' from public.receitas where extras ? 'brewfather_id'")
        ja = {x[0] for x in cur.fetchall()}

        gravadas, puladas, sem_estilo = 0, 0, []
        for r in receitas:
            if r["extras"]["brewfather_id"] in ja:
                puladas += 1
                continue
            nome_estilo = r.pop("estilo_nome", None)
            r["estilo_id"] = estilos.get(nome_estilo) if nome_estilo else None
            if nome_estilo and not r["estilo_id"]:
                sem_estilo.append(f'{r["nome"]} ("{nome_estilo}")')
            cur.execute("select public.salvar_receita(%s::jsonb)", (json.dumps(r),))
            gravadas += 1

        cur.execute("select count(*) from public.receitas")
        total = cur.fetchone()[0]

    if args.gravar:
        conn.commit()
    else:
        conn.rollback()

print(f"{'GRAVADO' if args.gravar else 'SIMULAÇÃO (nada gravado)'}: novas={gravadas} já existiam={puladas} "
      f"total na conta={total}")
for s in sem_estilo:
    print("Sem estilo no catálogo:", s)

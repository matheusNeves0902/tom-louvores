#!/usr/bin/env bash
# ============================================================
#  TOM LOUVORES — arquivos sem uso
#
#  Rode na pasta do site:   bash orfaos.sh
#
#  Lista cada arquivo e quem o cita. O que aparecer como SEM USO
#  é candidato a apagar — mas confira antes: um arquivo pode ser
#  chamado por um caminho diferente do nome, ou de fora do site.
# ============================================================

cd "$(dirname "$0")" || exit 1

# estes não são citados por ninguém e mesmo assim são necessários
proteger() {
  case "$1" in
    # páginas de entrada e o service worker: chamados pelo navegador
    index.html|repertorio.html|sw.js) return 0 ;;
    # do GitHub Pages: o CNAME aponta o domínio
    CNAME|README.md|.nojekyll) return 0 ;;
    # ferramentas de desenvolvimento
    checar.sh|orfaos.sh|verificar.js) return 0 ;;
    .*) return 0 ;;
  esac
  return 1
}

semUso=""
echo
for f in *; do
  [ -f "$f" ] || continue
  if proteger "$f"; then
    printf '  \033[34mmantido \033[0m %s\n' "$f"
    continue
  fi

  citado=$(grep -l -F -- "$f" *.html *.css *.js *.json 2>/dev/null | grep -v "^$f$" | tr '\n' ' ')

  if [ -z "$citado" ]; then
    printf '  \033[31mSEM USO \033[0m %s\n' "$f"
    semUso="$semUso $f"
  else
    printf '  \033[32musado   \033[0m %-20s ← %s\n' "$f" "$citado"
  fi
done

echo
if [ -z "$semUso" ]; then
  printf '\033[32m  nenhum arquivo sobrando\033[0m\n\n'
else
  printf '\033[31m  candidatos a apagar:\033[0m%s\n' "$semUso"
  echo
  echo "  Antes de apagar, confira se algum deles está na lista do sw.js:"
  for f in $semUso; do
    if grep -q "\"\./$f\"" sw.js 2>/dev/null; then
      printf '    %s está no cache do sw.js — tire de lá junto\n' "$f"
    fi
  done
  echo
fi
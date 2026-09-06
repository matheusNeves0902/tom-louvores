#!/usr/bin/env bash
# ============================================================
#  TOM LOUVORES — conferência pelo terminal
#
#  Rode na pasta do site:   bash checar.sh
#
#  Confere o que dá para conferir sem abrir o navegador:
#  sintaxe, codificação, arquivos faltando e a ordem das tags.
#  Para os testes que precisam da página rodando, use o
#  verificar.js no console.
# ============================================================

cd "$(dirname "$0")" || exit 1
falhas=0
ok()    { printf '  \033[32mok    \033[0m %s\n' "$1"; }
falha() { printf '  \033[31mFALHOU\033[0m %s\n' "$1"; falhas=$((falhas+1)); }

echo
echo "── 1. sintaxe do JavaScript ─────────────────────────────"
for f in *.js; do
  if node --check "$f" 2>/dev/null; then ok "$f"; else
    falha "$f"; node --check "$f" 2>&1 | head -3 | sed 's/^/         /'
  fi
done

echo
echo "── 1b. arquivos vazios ──────────────────────────────────"
vazio=0
for f in *.js *.html *.css; do
  [ -e "$f" ] || continue
  [ -s "$f" ] || { falha "$f tem 0 bytes"; vazio=1; }
done
[ "$vazio" -eq 0 ] && ok "nenhum arquivo vazio"
echo
echo "── 2 e 3. codificação e acentos ─────────────────────────"
# Feito em Python: o "file -bi" do macOS não existe (lá é -I) e
# devolvia "regular file" para tudo. E procurar o byte de "Ã" no
# grep acusa palavras corretas como LIGAÇÃO e VIOLÃO.
if command -v python3 >/dev/null 2>&1; then
  saida=$(python3 - <<'PYEOF'
import glob, sys

# sequências que só existem quando UTF-8 foi lido como Latin-1:
# um Ã maiúsculo seguido de minúscula acentuada nunca acontece
# em português correto
QUEBRADO = ["Ã©","Ã£","Ã§","Ãµ","Ã¡","Ã³","Ãº","Ã­","Ãª","Ã´","Ã¢","Ã ",
            "â€œ","â€\x9d","â€™","â€“","â€”","Â ","Â­","Ã\x87","Ã\x83"]

problemas = 0
for f in sorted(set(glob.glob("*.js") + glob.glob("*.html") + glob.glob("*.css"))):
    b = open(f, "rb").read()
    if not b:
        continue                      # arquivo vazio já foi avisado antes
    try:
        txt = b.decode("utf-8")
    except UnicodeDecodeError as e:
        print(f"FALHA|{f} não é UTF-8 válido (byte {hex(b[e.start])} na posição {e.start})")
        problemas += 1
        continue
    achados = [q for q in QUEBRADO if q in txt]
    if achados:
        print(f"FALHA|{f} tem acento embaralhado: {' '.join(achados[:3])}")
        problemas += 1
    else:
        print(f"OK|{f}")
sys.exit(0)
PYEOF
)
  while IFS='|' read -r estado msg; do
    [ -z "$msg" ] && continue
    if [ "$estado" = "OK" ]; then ok "$msg"; else falha "$msg"; fi
  done <<< "$saida"
else
  falha "python3 não encontrado: não dá para checar a codificação"
fi

echo
echo "── 4. BOM no começo do arquivo ──────────────────────────"
achou=0
for f in *.js *.html *.css; do
  [ -e "$f" ] || continue
  if [ "$(head -c 3 "$f" | od -An -tx1 | tr -d ' \n')" = "efbbbf" ]; then
    falha "$f tem BOM"; achou=1
  fi
done
[ "$achou" -eq 0 ] && ok "nenhum arquivo com BOM"

echo
echo "── 5. <meta charset> nas páginas ────────────────────────"
for f in *.html; do
  if grep -qi 'charset=["'"'"']*utf-8' "$f"; then ok "$f declara utf-8"
  else falha "$f sem <meta charset=\"utf-8\">"; fi
done

echo
echo "── 6. todo script citado existe na pasta ────────────────"
for f in *.html; do
  grep -o 'src="[^"]*\.js"' "$f" | sed 's/src="//;s/"//' | while read -r js; do
    case "$js" in http*) continue ;; esac
    [ -f "$js" ] && ok "$f → $js" || falha "$f cita $js, que não está na pasta"
  done
done

echo
echo "── 7. ordem de carregamento ─────────────────────────────"
# cada arquivo depende dos anteriores; fora de ordem, quebra tudo
ordem="lyra.js acordes.js sons.js opcoes.js afinador.js metronomo.js"
for f in *.html; do
  pos=""; anterior=0; erro=0
  for js in $ordem; do
    n=$(grep -n "src=\"$js\"" "$f" | head -1 | cut -d: -f1)
    [ -z "$n" ] && continue
    [ "$n" -lt "$anterior" ] && erro=1
    anterior=$n
  done
  [ "$erro" -eq 0 ] && ok "$f na ordem certa" || falha "$f com scripts fora de ordem"
done

echo
echo "── 8. service worker cobre os arquivos usados ───────────"
if [ -f sw.js ]; then
  for f in *.html; do
    grep -o 'src="[^"]*\.js"' "$f" | sed 's/src="//;s/"//' | while read -r js; do
      case "$js" in http*) continue ;; esac
      grep -q "\"\./$js\"" sw.js || falha "$js está na página mas fora do cache do sw.js"
    done
  done
  ok "lista do sw.js conferida"
else
  falha "sw.js não encontrado"
fi

echo
if [ "$falhas" -eq 0 ]; then
  printf '\033[32m  tudo certo\033[0m\n\n'
else
  printf '\033[31m  %s verificação(ões) falharam\033[0m\n\n' "$falhas"
fi
exit 0
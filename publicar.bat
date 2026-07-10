@echo off
cd /d "%~dp0"
echo =============================================
echo  ACN Sinal Verde - Publicar alteracoes
echo =============================================

:: Remove lock se existir
if exist ".git\index.lock" (
    echo Removendo index.lock...
    del /f ".git\index.lock"
)

:: Reset staging area (limpar staging corrompido)
echo Limpando staging area...
git reset HEAD 2>nul

:: Adicionar apenas os arquivos modificados relevantes
echo Adicionando arquivos...
git add src/SacTab.tsx
git add src/ProducaoTab.tsx
git add src/EngenhariaTab.tsx
git add src/ComprasTab.tsx

:: Status rapido
echo.
echo Arquivos a commitar:
git diff --cached --name-only

:: Commit
echo.
echo Fazendo commit...
git commit -m "SAC: fluxo veicular corrigido + Ver/Editar orcamento (Producao/SAC/Engenharia)"

:: Push
echo.
echo Enviando para GitHub...
git push origin main

echo.
echo =============================================
echo  PRONTO! Deploy iniciado no GitHub Actions.
echo  Aguarde ~2 minutos e atualize o site.
echo =============================================
pause

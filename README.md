# Toque Fácil

App web local para organizar cifras próprias, filtrar repertório pelos acordes conhecidos, praticar ritmos e afinar o violão.

## Executar

Na pasta do projeto, inicie um servidor local:

```powershell
npx --yes serve . --listen 3000
```

Abra `http://localhost:3000`. O servidor precisa continuar aberto enquanto você usa o app. A instalação como PWA e o afinador dependem de uma origem segura, como `localhost` ou HTTPS.

## Recursos

- Catálogo começa vazio para você importar ou criar suas próprias cifras.
- Editor de cifras no formato ChordPro: coloque os acordes entre colchetes junto à letra, por exemplo, `[C]uma linha [G]de exemplo`.
- Colagem de cifras com acordes em linhas separadas, conversão sugerida para ChordPro e revisão no editor antes de salvar.
- Organização em listas, filtros, busca, favoritas e reordenação manual do repertório.
- Modo de leitura em tela cheia, com ajuste de fonte e rolagem automática configurável.
- Transposição por semitom, metadados de tom/BPM, pré-visualização e impressão/Salvar como PDF.
- Importação de projetos JSON e cifras `.txt`, `.cho`, `.pro` ou `.chordpro`, com prévia editável; também aceita arrastar arquivos para a área de importação.
- Exportação do repertório em JSON e backup completo (cifras, listas, favoritas, ordem e preferências), com opção de mesclar ou substituir dados ao restaurar.
- Importação e reprodução local de áudio, download do arquivo original e exportação de um trecho selecionado para WAV.
- Sugestões experimentais de acordes por análise local do trecho de áudio; os marcadores de tempo permitem ouvir cada sugestão. São estimativas, não uma transcrição garantida; confirme os resultados antes de usar.
- Exercícios de ritmo com padrões de batida e metrônomo ajustável.
- Afinador cromático com calibração de Lá₄ entre 432 e 446 Hz.
- Preferências, cifras pessoais e favoritos salvos no navegador.
- PWA com shell da aplicação em cache para abrir sem internet depois do primeiro acesso.

As cifras e letras pessoais não são enviadas a um servidor; ficam no armazenamento local do navegador. Faça backups completos regularmente. Arquivos de áudio não são incluídos nos projetos ou backups JSON.

## Cifra Club e fontes

O [Cifra Club](https://www.cifraclub.com.br/) hospeda conteúdo de terceiros. O app oferece uma busca externa restrita ao domínio oficial, mas não extrai nem republica letras/cifras automaticamente. Use conteúdo que você tenha autorização para usar ou importe sua cifra localmente.

O [Cifras Studio Pro](https://github.com/brunoamaral2024/Cifras-Studio-Pro) é um editor de cifras sob licença MIT, não um catálogo de músicas. Seu fluxo de edição e transposição serviu como referência; o código dele não foi copiado para este projeto.

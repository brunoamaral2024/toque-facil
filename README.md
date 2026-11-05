# Toque Fácil

App web local para organizar cifras próprias, filtrar repertório pelos acordes conhecidos, praticar ritmos e afinar o violão.

## Executar

Na pasta do projeto, inicie um servidor local:

```powershell
npx --yes serve . --listen 3000
```

Abra `http://localhost:3000`. O servidor precisa continuar aberto enquanto você usa o app. A instalação como PWA e o afinador dependem de uma origem segura, como `localhost` ou HTTPS.

## Testes

Com Node.js instalado, execute os testes de regressão:

```powershell
npm test
```

O fluxo do GitHub Pages executa os mesmos testes antes de publicar o app.

## Recursos

- Catálogo começa vazio para você importar ou criar suas próprias cifras.
- Editor de cifras no formato ChordPro: coloque os acordes entre colchetes junto à letra, por exemplo, `[C]uma linha [G]de exemplo`.
- Colagem de cifras com acordes em linhas separadas, conversão sugerida para ChordPro e revisão no editor antes de salvar.
- Organização em listas, filtros, busca, favoritas e reordenação manual do repertório.
- Categorias por 3, 4 e 5+ acordes, calculadas a partir das cifras adicionadas pelo usuário, e filtro opcional que exclui acordes ainda não selecionados.
- Modo de apresentação em tela cheia para uma lista, com cifra simplificada, navegação anterior/próxima e atalhos pelas setas do teclado.
- Trilha original de prática de 7 etapas, com marcação de progresso salva localmente e atalhos para preparar o metrônomo.
- Modo de leitura em tela cheia, com ajuste de fonte e rolagem automática configurável.
- Transposição por semitom, metadados de tom/BPM, pré-visualização e impressão/Salvar como PDF.
- Importação de projetos JSON e cifras `.txt`, `.cho`, `.pro` ou `.chordpro`, com prévia editável; também aceita arrastar arquivos para a área de importação.
- Integração com JSON do Cifras Studio Pro: importa letras, metadados e ordem/repetições das seções; exporta a cifra aberta em uma seção para continuar editando no Studio Pro.
- Exportação do repertório em JSON e backup completo (cifras, listas, favoritas, ordem e preferências), com opção de mesclar ou substituir dados ao restaurar.
- Importação e reprodução local de áudio, download do arquivo original e exportação de um trecho selecionado para WAV.
- Sugestões experimentais de acordes por análise local do trecho de áudio; os marcadores de tempo permitem ouvir cada sugestão. São estimativas, não uma transcrição garantida; confirme os resultados antes de usar.
- Exercícios de ritmo com padrões de batida e metrônomo ajustável.
- Afinador cromático com calibração de Lá₄ entre 432 e 446 Hz.
- Começo guiado para selecionar acordes iniciais, criar ou importar uma cifra e iniciar a prática.
- Preferências, cifras pessoais e favoritos salvos no navegador.
- PWA com cache offline e aviso para aplicar atualizações quando uma nova versão estiver pronta.

As cifras e letras pessoais não são enviadas a um servidor; ficam no armazenamento local do navegador e do dispositivo em que foram criadas. Abrir o app por um endereço público em outro aparelho não sincroniza os dados automaticamente. Para transferir o repertório, baixe um backup completo e restaure-o no outro aparelho. Faça backups regularmente; arquivos de áudio não são incluídos nos projetos ou backups JSON.

O app grava cifras, listas, favoritas, ordem e preferências em um único registro local. Se o navegador recusar a gravação, o app informa o erro e não confirma a importação ou restauração como concluída.

## Cifra Club e fontes

O [Cifra Club](https://www.cifraclub.com.br/) hospeda conteúdo de terceiros. O app oferece uma busca externa restrita ao domínio oficial, mas não extrai nem republica letras/cifras automaticamente. Use conteúdo que você tenha autorização para usar ou importe sua cifra localmente.

O [Cifras Studio Pro](https://github.com/brunoamaral2024/Cifras-Studio-Pro) é um editor de cifras sob licença MIT, não um catálogo de músicas. Abra-o pelo link no editor do Toque Fácil. Para trazer um projeto, use **Carregar Projeto Salvo** no Studio Pro e importe o JSON baixado no Toque Fácil; para o caminho inverso, abra uma cifra e use **Exportar para Studio Pro**, depois carregue o JSON no editor externo. A integração usa o formato de projeto e não copia o código do editor.

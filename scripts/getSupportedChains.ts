const getSupportedChains = async () => {
  const result = await fetch('https://api.rhino.fi/bridge/configs')
  const data = await result.json()
  const header = '| Chain | Tokens |'

  // console.log(Object.keys(data).map(key => `- ${data[key].name} (${Object.keys(data[key].tokens).join(', ')})`).join('\n'))
  console.log(header)
  console.log('|---|---|')
  console.log(Object.keys(data).map(key => `| ${data[key].name} | ${Object.keys(data[key].tokens).join(', ')} |`).join('\n'))
}

getSupportedChains()
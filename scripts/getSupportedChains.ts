const getSupportedChains = async () => {
  const result = await fetch('https://api.rhino.fi/bridge/configs')
  const data = await result.json()
  const header = '| Chain | Tokens |'
  const enabledChains = Object.entries(data).filter(([key, value]) => value.status === 'enabled')

  console.log(header)
  console.log('|---|:---:|')
  console.log(enabledChains.map(entry => `| ${entry[1].name} | ${Object.keys(entry[1].tokens).join(', ')} |`).join('\n'))
}

getSupportedChains()

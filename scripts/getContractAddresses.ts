const getContractAddresses = async () => {
  const result = await fetch('https://api.rhino.fi/bridge/configs')
  const data = await result.json()
  const header = '| Chain | Contract address |'
  const enabledChains = Object.values(data).filter(chain => chain.status === 'enabled')

  console.log(header)
  console.log('|---|---|')
  console.log(enabledChains.map(chain => `| ${chain.name} | ${chain.contractAddress} |`).join('\n'))
}

getContractAddresses()

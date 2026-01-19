const getSupportedSDAChains = async () => {
    const result = await fetch('https://api.rhino.fi/bridge/configs')
    const data = await result.json()
    const header = '| Chain | Tokens |'
    const enabledChains = Object.entries(data).filter(
        ([key, value]) => value.status === 'enabled' && value.enabledDepositAddress === true
    )

    console.log(header)
    console.log('|---|:---:|')
    console.log(
        enabledChains
            .map((entry) => {
                const chainConfig = entry[1]
                const nativeToken = chainConfig.nativeTokenName
                const tokens = Object.keys(chainConfig.tokens).filter(
                    (token) => token !== nativeToken
                )
                return `| ${chainConfig.name} | ${tokens.join(', ')} |`
            })
            .join('\n')
    )
}

getSupportedSDAChains()

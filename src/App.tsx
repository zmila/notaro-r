import { useCallback, useEffect, useState } from 'react'
import {
  Button, Flex,
  Text, TextField, Theme,
} from '@radix-ui/themes'


interface Hello {
  name: string,
  time: string
}

export default function App() {
  const [name, setName] = useState('')
  const [hello, setHello] = useState<Hello | null>(null)
  
  const refresh = useCallback(async () => {
    try {
      const h = await tiny.api.call('hello', { name }) as Hello
      setHello(h)
    } catch (e) {
      tiny.log('refresh failed: ' + e)
    }
  }, [name])

  return (
    <Theme appearance="light" accentColor="iris" grayColor="slate"
      radius="large" style={{ height: '100vh' }}>
      <Flex direction="column" gap="3" p="4" maxWidth="400px">
        <TextField.Root placeholder="Name" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') refresh() }} />
        <Button onClick={refresh}>say Hello</Button>
        <Text>{hello && `Hello ${hello.name}, at time ${hello.time}.`}</Text>
      </Flex>
    </Theme>
  )
}



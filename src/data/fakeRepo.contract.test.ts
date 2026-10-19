import { describeRepoContract } from './contract/repoContract'
import { DEMO_PASSWORD } from './demoData'
import { createFakeRepo } from './fakeRepo'

describeRepoContract('in-memory', async () => {
  const repo = createFakeRepo()
  return {
    repo,
    actAs: async (email) => {
      await repo.auth.signIn(email, DEMO_PASSWORD)
    },
  }
})

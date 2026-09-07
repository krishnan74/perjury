Hello ETHOnline hackers! 👋

A dedicated ENSv2 deployment is live on Sepolia for the hackathon. Its addresses are listed here: https://feature-permres-inode-refact.docs-bao.pages.dev/learn/deployments#sepolia-ensv2-beta - please build your hackathon project against these, and not the addresses found on the production docs.

⚠️ Important for resolution: viem and ethers ship with a built-in Universal Resolver address, which must be overwritten once in your code with the hackathon Universal Resolver. Otherwise your project will resolve against the wrong deployment. Ready-made viem/ethers snippets are on the same page: https://feature-permres-inode-refact.docs-bao.pages.dev/learn/deployments#sepolia-ensv2-beta

These serve the hackathon deployment exclusively:

ENS Explorer: https://hackathon-deployment-portal-app.ens-cf.workers.dev/
ENS App (register your names here): https://hackathon-deployment-manager-app-v4.ens-cf.workers.dev/

ENSv2 docs for the hackathon deployment: https://feature-permres-inode-refact.docs-bao.pages.dev/ensv2/overview

Happy hacking! 🛠️
Dheeraj — 9/5/26, 7:52 AM
Hi @Kevin | ENS

Hackathon manager registration keeps failing on Sepolia via HCA.

Tried:

Funded EOA with Sepolia ETH + MockUSDC
Funded HCA 0xA54465eFAF8E70A0Df12De6...... with 0.05 ETH + 60 MockUSDC (0xcbfd…6f05)
Errors:
no destination-chain balance… gas refund
Then: quote returned no spend amount
Session chainId is 11155111 (Sepolia), not a separate L2.

Is unsponsored HCA registration broken/sponsored right now, or is there an EOA / non-HCA register path for hackathon teams?

Happy to share txs/screenshots. Fellow hackers hitting the same wall , please drop a 👍.
Dheeraj — 9/5/26, 7:53 PM
the App can’t compute what to spend,” which is often: wrong/unsupported payment token for the quoter, a new session account that isn’t the one you funded, or a hackathon App / HCA quoting bug (fallback model broken). 
Web3-Degens — 9/5/26, 8:27 PM
@Dheeraj yes, there is a broken layer for payment in the App. We skipped the app and went directly to the contract, it worked for us, to safe time try it too. Greetings Simon
CriptoPoeta [Arc],  — Yesterday at 1:17 AM
Hello there - looking for help integrating ENS V2 in prod. When will it most likely be availble.
CriptoPoeta [Arc],  — Yesterday at 3:08 AM
Also, ENSV2 can be made compatible with Arc Testnet in some way?
tushar [RSK],  — Yesterday at 4:37 PM
can anyone help me with this I am unable to proceed for this
Image
tushar [RSK],  — Yesterday at 5:32 PM
Hitting a hard blocker registering a name on the hackathon ENS app.

Every registration attempt fails at the "Deploy resolver" step with:

RPC eth_sendRawTransaction: gas limit too high (cap: 16777216, tx: 21000000)

Reproduced across 3 separate RPC providers (MetaMask default/Infura, Alchemy, and a public Sepolia RPC), so it looks like the app is hardcoding a 21M gas limit for the resolver deployment tx, above what most providers will accept.

App: hackathon-deployment-portal-app.ens-cf.workers.dev
Wallet: MetaMask, Sepolia
Trying to register: onchain-heartbeat.eth

Anyone else hitting this, or is there a known fix/workaround?
tushar [RSK],  — Yesterday at 6:10 PM
the deployProxy call reverts specifically because of a malformed initialize payload, the implementation doesn't expose that selector, and the first arg looks like an unfilled EOA placeholder, plus a separate 21M gas hardcode
@Kevin | ENS @Yash | ENS
berkingurcan — Yesterday at 8:28 PM
Hello!
I am building Capsule for the hackathon — an AI agent launchpad where agents get their identity and config directly from ENSv2 subnames.

I would love to get quick mentor feedback on a few points:

I use ENSv2 record permissions so an agent can only update its heartbeat text record. If the owner revokes that permission, the agent cannot write on-chain and automatically stops. Is this the recommended way to handle agent access control in ENSv2?

Do you have any recommended text-record names for AI agents (like agent.model, agent.prompt, agent.endpoint) for agent-to-agent communication?

Also, I would love to show the current phase of the project and get some suggestions/feedback async or in a meeting.
Kevin | ENS [GM],  — Yesterday at 9:27 PM
Hi @tushar, thanks for letting us know! I informed the frontend team about the problems with the ENS app. However, the ENS app itself is just a convenience layer; you can just register a name with the smart contracts directly as @Web3-Degens suggested. I'll let you know once the problems on the frontend are fixed 
tushar [RSK],  — Yesterday at 9:35 PM
let me try
and thanks for reverting even on the eweekend 🙂
berkingurcan — 5:40 PM
@Kevin | ENS Up up! 😄
Simon Emanuel ses.eth — 6:29 PM
Hey Berkingurcan, that is a great idea.
The heartbeat is exactly one of the reasons why we created a more complex permission model. That would make a great example/use-case
Yes, agent- prefixes are a good way. Use - instead of .. Also check out these ENSIPs: https://docs.ens.domains/ensip/25/, https://docs.ens.domains/ensip/26/, https://docs.ens.domains/ensip/27

Generally speaking, if your text-records could become a global standard, do agent-. If it's just for your application, make a vendor prefix like com.example.agent-endpoint
tushar [RSK],  — 7:23 PM
Hello folks
I am building an onchain-heartbeat.An AI narrator that comments on live chain activity, signing each line with its own onchain identity: onchain-heartbeat.eth on the ETHOnline ENSv2 deployment.
viem's Sepolia Universal Resolver is overridden with the hackathon proxy. Registered direct-to-contracts (commit-reveal, USDC fee) after the ENS app failed — bug reported. Records live on a per-name Permissioned Resolver proxy I deployed, keyed by DNS-encoded name.
It resolves, and the control check holds: my name resolves only through the hackathon resolver while nick.eth / vitalik.eth stay null on it so it's genuinely that deployment answering.

Would value a review on:
Is a resolving name enough for the ENS side, or should the identity do more than label the narrator?
Should I be writing text records (avatar, description) rather than just an address record?
Did I miss a simpler path than deploying my own resolver proxy?

would love to get some feedback if you are open for any
 [RSK], 
Simon Emanuel ses.eth — 8:38 PM
Well done with registering a name directly through the contracts! The hackathon ENS Explorer should work now, I just registered a name: https://hackathon-deployment-portal-app.ens-cf.workers.dev/
No, just resolving a name is not enough
Yes, add text-records, etc
Probably but it's fine

One thing you could do: Make a subname system that gives each comment from that AI narrator a name. Like hello-world.posts.onchain-heartbeat.eth. You could either post those comments onchain, which is cool but kinda expensive on mainnet,  or offchain, which would force you to do something with CCIP-read. That CCIP-read gateway could validate the comment though. 
ENS Explorer App
Explore ENS names and addresses
ENS Explorer App
king_slayer — 9:06 PM
hello everyone 
Building an agent-identity system where a subname's live state (active/revoked) gates whether a linked wallet can transact — via Enhanced Access Control + a custom Permissioned Resolver. Is deriving real authorization from name state itself an interesting enough use of ENSv2, or should we push further (e.g., have the registry itself enforce something, not just expose readable state)?

would love to get some feedback if you are open for any
Simon Emanuel ses.eth — 9:19 PM
I like the idea of the super-name defining what a subname can do. Basically having a agent-fleet under *.agent-fleet.eth where simply by revoking the subname, the agent looses permission.

The obvious things would be to add ENSIP-25 and -26 text records.
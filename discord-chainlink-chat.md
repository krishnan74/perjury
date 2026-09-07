Dear @Solange Gueiros | Chainlink Labs nice to be back and exited for the Hackathon tomorrow. Can you please support us with the following question? Our question is about access. The hello-confidential-workflows template lists under prerequisites: "Beta access required through your Chainlink account team." As a hackathon team we don't have an account yet — so what's the path for us? Happy to send whatever you need (GitHub handle, wallet address, email, team details), just tell us where.

Related: does cre workflow simulate --target staging-settings work without that grant, or does staging require it too? Thanks again for your support and looking forward to your reply and wish you a nice day. Greetings Simon 
Joel [MLH],  — 9/4/26, 1:20 PM
Hey  @Solange Gueiros | Chainlink Labs  and @Andrej | Chainlink Labs  following up on Web3-Degens' question above since we're in the same boat. Submitted the Confidential Workflows early access form today (Sept 4). While that's in review, does cre workflow simulate (without --target staging-settings) run fully locally with no grant needed, or does the beta gate apply there too? Trying to plan around whether we have a no-grant-required fallback for the demo if approval doesn't land by submission. 
Darby | Chainlink Labs — 9/4/26, 4:40 PM
Hey Joel & web3degens, yes cre workflow simulate will work for confidential workflows. The beta access for hello world confidential is to deploy the workflow to the confidential workflow don, and secrets to the vault don.
Yagna RDK [CODE],  — 9/5/26, 3:47 PM
gm chainlink team,

Just a quick question, we're considering using CRE Confidential Workflows to evaluate private risk/policy parameters before an AI agent can execute a DeFi action. What kind of confidential computation would you consider meaningful enough to qualify as a core CRE use case rather than simply putting an existing calculation inside a TEE?
CriptoPoeta [Arc],  — Yesterday at 3:05 AM
hi there - please list Arc Testnet and Arc Mainnet Price Feeds in Chainlink docs.
Kingizie👑 [Arc],  — Yesterday at 1:08 PM
@Solange Gueiros | Chainlink Labs  and @Andrej | Chainlink Labs

submitted for the confidential workflow early access today. want to know how long it will take to get an approval ?
prof. — Yesterday at 2:53 PM
Hello, I am trying to implement chainlink CRE but I cannot see button for generating API key on my dashboard
Image
LogiqElza [ZK],  — Yesterday at 7:54 PM
Org ID: org_cukZT25aOjmFoGZG 
Workflow: wizard-staging (00bf398105e7f12a5ce218898b16a2a9681cecb214b82f3c3287c48f838e12c1)

Hi there Chainlink Team. My confidential workflow (TypeScript, HTTP Trigger) is ACTIVE in the private registry, cre workflow simulate runs as expected with my test payloads. But I can't figure out where I can find the endpoint that accepts HTTP Trigger requests for live testing. Any help appreciated, I'll be happy to provide more details if needed. Thanks.
Maitreya — Yesterday at 9:42 PM
Hi, I had a question for Continuity / ETHOnline — upgrading Aethon (browser Solidity IDE). Planning CRE Confidential Workflows as a pre–MetaMask-deploy AI audit gate (Audit Firewall–style, secrets in TEE, optional Sepolia consumer for verdict). Form submitted / submitting for Confidential access. Can we qualify with CRE CLI simulation + video, and is that integration shape what you’re looking for?
 [CODE], 
Frank Kong | Chainlink Labs — 12:10 PM
CRE confidential workflow makes sense when proprietary data, rules, and policies are run and calculated within it.
Frank Kong | Chainlink Labs — 12:15 PM
If you have a problem generating API keys, can you try to use the cre login and cre whoami to use browser-based way to login and authenticate?
 [ZK], 
Frank Kong | Chainlink Labs — 12:25 PM
Please find more details on how to use http trigger on a deployed workflow in the page. https://docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/triggering-deployed-workflows
Chainlink Documentation
Triggering Deployed Workflows | Chainlink Documentation
Trigger deployed CRE workflows with HTTP requests: learn the JSON-RPC format, JWT authentication, and signature generation for production use.
Triggering Deployed Workflows | Chainlink Documentation
 [Arc], 
Frank Kong | Chainlink Labs — 12:26 PM
I am afraid that we don't support Arc yet.
prof. — 12:34 PM
Alright
Frank Kong | Chainlink Labs — 12:43 PM
If this is the first time you add CRE confidential to your product. then yes
Denis:trophy: — 3:30 PM
@Frank Kong | Chainlink Labs could you check my request for the CRE early access? My project is called Verdikt. 
 [CODE], 
mystic of boneyard — 4:59 PM
Details page says anything that touches actual data and triggers a state change onchain


I had similar question, so I looked it up
Frank Kong | Chainlink Labs — 5:33 PM
What is your orgId?
Denis:trophy: — 5:37 PM
org_BMA1mvCVfK49Uaw9
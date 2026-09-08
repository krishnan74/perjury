// SPDX-License-Identifier: MIT
// Agent registry and verifiably random witness assignment. See docs/design.md §2.2.
pragma solidity 0.8.26;

import {IClaimRegistry, IWitnessRoster, IStandingReader} from "./interfaces/IPerjury.sol";

/// @dev Chainlink VRF v2.5. Subscription ids are uint256 and the request is a
///      struct — the v2 positional form does not exist on the v2.5 coordinator.
library VRFV2PlusClient {
    bytes4 public constant EXTRA_ARGS_V1_TAG = bytes4(keccak256("VRF ExtraArgsV1"));

    struct ExtraArgsV1 {
        bool nativePayment;
    }

    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }

    function argsToBytes(ExtraArgsV1 memory args) internal pure returns (bytes memory) {
        return abi.encodePacked(EXTRA_ARGS_V1_TAG, abi.encode(args));
    }
}

interface IVRFCoordinator {
    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata req)
        external
        returns (uint256 requestId);
}

/// @title WitnessRoster — agent registry and verifiably random witness assignment
/// @notice The anti-collusion core. `submitClaim` on ClaimRegistry has no witness
///         parameter, and nothing here lets a caller name one: the only path to
///         `_assign` is the VRF coordinator's callback.
contract WitnessRoster is IWitnessRoster {
    /// @dev Agents stake to be eligible. Slashable when shown to have lied, so
    ///      lying to win one bond is unprofitable, and each sybil identity costs
    ///      real money rather than a gas fee (ADR 0007).
    uint256 public constant REGISTRATION_STAKE = 0.05 ether;

    int256 public constant MIN_STANDING = 0;
    uint64 public constant FLAG_COOLDOWN = 24 hours;
    /// @dev Bounded so the VRF callback can never run out of gas walking a large roster.
    uint256 public constant MAX_WALK = 32;

    struct Agent {
        bytes32 ensNode; // namehash, used for reads
        bytes dnsName; // DNS wire format, required by ENSv2 setText
        bool active;
        uint64 registeredAt;
        uint256 stake; // slashable collateral
    }

    IVRFCoordinator public immutable coordinator;
    IStandingReader public immutable standingReader;
    bytes32 public immutable keyHash;
    uint256 public immutable subId;
    uint32 public immutable callbackGasLimit;

    IClaimRegistry public registry;
    bool public wired;
    address private immutable _deployer;

    address[] public agentList;
    mapping(address => Agent) public agents;
    mapping(bytes32 => bool) public nodeTaken;
    mapping(address => uint64) public flaggedUntil;

    struct Request {
        uint256 claimId;
        address claimant;
        bool pending;
    }

    mapping(uint256 => Request) public requests;

    event AgentRegistered(address indexed agent, bytes32 indexed ensNode);
    event WitnessRequested(uint256 indexed claimId, uint256 indexed requestId);
    event WitnessDrawn(uint256 indexed claimId, address indexed witness, uint256 seed);
    event NoEligibleWitness(uint256 indexed claimId);
    event AgentFlagged(address indexed agent, uint64 until);
    event AgentSlashed(address indexed agent, uint256 amount, uint256 remainingStake);
    event AgentToppedUp(address indexed agent, uint256 stake);

    error NotCoordinator();
    error NotRegistry();
    error NotDeployer();
    error AlreadyWired();
    error AlreadyRegistered();
    error NodeTaken();
    error UnknownRequest();
    error NotStandingWriter();
    error StakeTooSmall();
    error NothingStaked();

    constructor(
        IVRFCoordinator coordinator_,
        IStandingReader standingReader_,
        bytes32 keyHash_,
        uint256 subId_,
        uint32 callbackGasLimit_
    ) {
        coordinator = coordinator_;
        standingReader = standingReader_;
        keyHash = keyHash_;
        subId = subId_;
        callbackGasLimit = callbackGasLimit_;
        _deployer = msg.sender;
    }

    function wireRegistry(IClaimRegistry registry_) external {
        if (msg.sender != _deployer) revert NotDeployer();
        if (wired) revert AlreadyWired();
        registry = registry_;
        wired = true;
    }

    /// @notice Self-registration, backed by a slashable stake.
    function registerAgent(bytes32 ensNode, bytes calldata dnsName) external payable {
        if (msg.value < REGISTRATION_STAKE) revert StakeTooSmall();
        if (agents[msg.sender].active) revert AlreadyRegistered();
        if (nodeTaken[ensNode]) revert NodeTaken();
        agents[msg.sender] = Agent({
            ensNode: ensNode,
            dnsName: dnsName,
            active: true,
            registeredAt: uint64(block.timestamp),
            stake: msg.value
        });
        nodeTaken[ensNode] = true;
        agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, ensNode);
    }

    function isRegistered(address agent) public view returns (bool) {
        return agents[agent].active;
    }

    function nodeOf(address agent) external view returns (bytes32) {
        return agents[agent].ensNode;
    }

    function dnsNameOf(address agent) external view returns (bytes memory) {
        return agents[agent].dnsName;
    }

    function agentCount() external view returns (uint256) {
        return agentList.length;
    }

    /// @notice Eligibility is derived live from the ENS standing record — there is
    ///         no maintained allowlist and no admin path to include or exclude.
    function isEligible(address candidate) public view returns (bool) {
        Agent storage a = agents[candidate];
        if (!a.active) return false;
        if (a.stake < REGISTRATION_STAKE) return false; // under-collateralised
        if (flaggedUntil[candidate] > block.timestamp) return false;
        try standingReader.standingOfName(a.ensNode, a.dnsName) returns (int256 standing) {
            return standing >= MIN_STANDING;
        } catch {
            // A record we cannot read is not a record we can trust.
            return false;
        }
    }

    function eligibleCountExcluding(address excluded) public view returns (uint256 n) {
        uint256 len = agentList.length;
        for (uint256 i; i < len; ++i) {
            address c = agentList[i];
            if (c != excluded && isEligible(c)) ++n;
        }
    }

    function requestWitness(uint256 claimId, address claimant) external returns (uint256 requestId) {
        if (msg.sender != address(registry)) revert NotRegistry();
        requestId = coordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subId,
                requestConfirmations: 3,
                callbackGasLimit: callbackGasLimit,
                numWords: 1,
                // LINK payment; set nativePayment true to pay in ETH instead.
                extraArgs: VRFV2PlusClient.argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );
        requests[requestId] = Request({claimId: claimId, claimant: claimant, pending: true});
        emit WitnessRequested(claimId, requestId);
    }

    /// @dev The ONLY entry point to assignment, and only the coordinator may call it.
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != address(coordinator)) revert NotCoordinator();
        Request memory r = requests[requestId];
        if (!r.pending) revert UnknownRequest();
        delete requests[requestId];
        _assign(r.claimId, r.claimant, randomWords[0]);
    }

    function _assign(uint256 claimId, address claimant, uint256 seed) internal {
        uint256 len = agentList.length;
        if (len != 0) {
            uint256 walk = len < MAX_WALK ? len : MAX_WALK;
            uint256 start = seed % len;
            for (uint256 i; i < walk; ++i) {
                address cand = agentList[(start + i) % len];
                if (cand != claimant && isEligible(cand)) {
                    emit WitnessDrawn(claimId, cand, seed);
                    registry.onWitnessAssigned(claimId, cand);
                    return;
                }
            }
        }
        emit NoEligibleWitness(claimId);
        registry.onAssignmentFailed(claimId);
    }

    /// @notice Slash an agent shown to have lied. Only the registry's settlement
    ///         path reaches this; there is no operator route to it.
    /// @return slashed the amount taken from the agent's stake
    function slash(address agent, uint256 amount) external returns (uint256 slashed) {
        if (msg.sender != address(registry)) revert NotRegistry();
        Agent storage a = agents[agent];
        slashed = amount > a.stake ? a.stake : amount;
        a.stake -= slashed;
        // An agent below the stake floor cannot be drawn until it tops up.
        if (a.stake < REGISTRATION_STAKE) flaggedUntil[agent] = type(uint64).max;
        emit AgentSlashed(agent, slashed, a.stake);
    }

    /// @notice Top up after a slash, restoring eligibility.
    function topUp() external payable {
        Agent storage a = agents[msg.sender];
        if (!a.active) revert NothingStaked();
        a.stake += msg.value;
        if (a.stake >= REGISTRATION_STAKE && flaggedUntil[msg.sender] == type(uint64).max) {
            flaggedUntil[msg.sender] = 0;
        }
        emit AgentToppedUp(msg.sender, a.stake);
    }

    function stakeOf(address agent) external view returns (uint256) {
        return agents[agent].stake;
    }

    /// @notice Cooldown flag applied on a mismatch. Only the standing writer
    ///         reaches this, and only from the settlement path — never an operator.
    function onMismatch(address claimant) external {
        if (msg.sender != ClaimRegistryLike(address(registry)).standingWriter()) revert NotStandingWriter();
        uint64 until = uint64(block.timestamp) + FLAG_COOLDOWN;
        flaggedUntil[claimant] = until;
        emit AgentFlagged(claimant, until);
    }
}

interface ClaimRegistryLike {
    function standingWriter() external view returns (address);
}

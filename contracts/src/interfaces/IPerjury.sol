// SPDX-License-Identifier: MIT
// Shared types and interfaces for the Perjury protocol.
pragma solidity 0.8.26;

enum Status {
    None,
    Pending, // bond escrowed, awaiting VRF
    WitnessAssigned, // witness drawn, awaiting finding + adjudication
    Adjudicated, // tribunal returned a verdict
    Settled // bond paid out
}

/// @dev Unverifiable is NOT a pass. It returns the bond and leaves standing untouched.
enum Verdict {
    None,
    Match,
    Mismatch,
    Unverifiable
}

struct Claim {
    address claimant;
    address witness; // 0 until VRF fulfils
    bytes32 subject; // what the claim is about
    bytes32 claimHash; // commitment to claim text + claimant evidence
    bytes32 evidenceCommitment; // set by the tribunal at adjudication
    uint256 bond;
    uint64 submittedAt;
    uint64 assignedAt;
    Status status;
    Verdict verdict;
}

interface IClaimRegistry {
    function onWitnessAssigned(uint256 claimId, address witness) external;
    function onAssignmentFailed(uint256 claimId) external;
    function recordVerdict(uint256 claimId, Verdict verdict, bytes32 evidenceCommitment) external;
    function claimOf(uint256 claimId) external view returns (Claim memory);
}

interface IWitnessRoster {
    function isRegistered(address agent) external view returns (bool);
    function isEligible(address candidate) external view returns (bool);
    function requestWitness(uint256 claimId, address claimant) external returns (uint256 requestId);
    function nodeOf(address agent) external view returns (bytes32);
    function dnsNameOf(address agent) external view returns (bytes memory);
    function onMismatch(address claimant) external;
}

/// @notice Reads an agent's standing from its ENS record. Implemented over a
///         resolver text record; mocked in tests.
interface IStandingReader {
    function standingOf(bytes32 node) external view returns (int256);
}

interface IStandingWriter {
    function applyVerdict(uint256 claimId, Verdict verdict) external;
}

/// @notice Minimal ENSv2 Permissioned Resolver surface Perjury touches.
/// @dev Deliberately tiny: the writer must not be able to reach setAddr,
///      setName, link, upgrade, or any role-granting function. Note setText
///      takes a DNS-encoded name (ENSv2), while reads use a namehash node.
interface ITextResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function setText(bytes calldata dnsName, string calldata key, string calldata value) external;
}

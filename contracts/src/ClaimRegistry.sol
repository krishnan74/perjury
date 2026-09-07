// SPDX-License-Identifier: MIT
// Claim lifecycle and bond escrow. See docs/design.md §2.
pragma solidity 0.8.26;

import {Claim, Status, Verdict, IClaimRegistry, IWitnessRoster, IStandingWriter} from
    "./interfaces/IPerjury.sol";

/// @title ClaimRegistry — claim lifecycle and bond escrow
/// @notice Holds bonds and records verdicts. There is deliberately no owner,
///         no pause, and no way to change `roster` or `verdictSink` after
///         deployment wiring is locked.
contract ClaimRegistry is IClaimRegistry {
    uint256 public constant MIN_BOND = 0.001 ether;

    IWitnessRoster public immutable roster;

    /// @dev Set once by `wireSink` then locked forever. Not an admin hatch:
    ///      after `wired` flips true no address in this contract can change.
    address public verdictSink;
    address public standingWriter;
    bool public wired;
    address private immutable _deployer;

    uint256 public nextClaimId = 1;
    mapping(uint256 => Claim) private _claims;
    mapping(address => uint256) public withdrawable;

    event ClaimSubmitted(uint256 indexed claimId, address indexed claimant, bytes32 subject, uint256 bond);
    event WitnessAssigned(uint256 indexed claimId, address indexed witness);
    event AssignmentFailed(uint256 indexed claimId);
    event VerdictRecorded(uint256 indexed claimId, Verdict verdict, bytes32 evidenceCommitment);
    event Settled(uint256 indexed claimId, address indexed beneficiary, uint256 amount);
    event Withdrawn(address indexed who, uint256 amount);

    error NotRoster();
    error NotSink();
    error NotDeployer();
    error AlreadyWired();
    error NotWired();
    error BondTooSmall();
    error NotRegistered();
    error BadStatus();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(IWitnessRoster roster_) {
        roster = roster_;
        _deployer = msg.sender;
    }

    /// @notice One-time deployment wiring. Reverts forever after the first call.
    function wireSink(address verdictSink_, address standingWriter_) external {
        if (msg.sender != _deployer) revert NotDeployer();
        if (wired) revert AlreadyWired();
        verdictSink = verdictSink_;
        standingWriter = standingWriter_;
        wired = true;
    }

    modifier onlyRoster() {
        if (msg.sender != address(roster)) revert NotRoster();
        _;
    }

    modifier onlySink() {
        if (!wired) revert NotWired();
        if (msg.sender != verdictSink) revert NotSink();
        _;
    }

    /// @notice Post a claim with a bond. Note: no witness argument exists.
    function submitClaim(bytes32 subject, bytes32 claimHash) external payable returns (uint256 claimId) {
        if (msg.value < MIN_BOND) revert BondTooSmall();
        if (!roster.isRegistered(msg.sender)) revert NotRegistered();

        claimId = nextClaimId++;
        Claim storage c = _claims[claimId];
        c.claimant = msg.sender;
        c.subject = subject;
        c.claimHash = claimHash;
        c.bond = msg.value;
        c.submittedAt = uint64(block.timestamp);
        c.status = Status.Pending;

        emit ClaimSubmitted(claimId, msg.sender, subject, msg.value);
        roster.requestWitness(claimId, msg.sender);
    }

    function onWitnessAssigned(uint256 claimId, address witness) external onlyRoster {
        Claim storage c = _claims[claimId];
        if (c.status != Status.Pending) revert BadStatus();
        c.witness = witness;
        c.assignedAt = uint64(block.timestamp);
        c.status = Status.WitnessAssigned;
        emit WitnessAssigned(claimId, witness);
    }

    /// @dev No eligible witness existed. Refund; never fall back to a biased pick.
    function onAssignmentFailed(uint256 claimId) external onlyRoster {
        Claim storage c = _claims[claimId];
        if (c.status != Status.Pending) revert BadStatus();
        c.status = Status.Adjudicated;
        c.verdict = Verdict.Unverifiable;
        emit AssignmentFailed(claimId);
        _settle(claimId);
    }

    /// @notice Called only by VerdictSink, which accepts only the CRE tribunal.
    function recordVerdict(uint256 claimId, Verdict verdict, bytes32 evidenceCommitment) external onlySink {
        Claim storage c = _claims[claimId];
        if (c.status != Status.WitnessAssigned) revert BadStatus();
        c.verdict = verdict;
        c.evidenceCommitment = evidenceCommitment;
        c.status = Status.Adjudicated;
        emit VerdictRecorded(claimId, verdict, evidenceCommitment);
        _settle(claimId);
    }

    function _settle(uint256 claimId) internal {
        Claim storage c = _claims[claimId];
        address beneficiary = c.verdict == Verdict.Mismatch ? c.witness : c.claimant;
        uint256 amount = c.bond;
        c.status = Status.Settled;
        withdrawable[beneficiary] += amount;
        emit Settled(claimId, beneficiary, amount);
    }

    /// @dev Pull payment: settlement must never revert on a hostile recipient.
    function withdraw() external {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function claimOf(uint256 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }
}

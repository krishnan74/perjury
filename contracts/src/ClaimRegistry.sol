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

    /// @dev Paid to the witness on EVERY verdict, funded by the claimant's
    ///      submission fee. The witness used to earn only on Mismatch, which made
    ///      fabricating disagreement its dominant strategy (ADR 0007). A flat fee
    ///      makes it financially indifferent to the outcome.
    uint256 public constant WITNESS_FEE = 0.002 ether;

    /// @dev Posted to appeal a verdict. Higher than the bond, so appealing is not
    ///      a free option on every adverse outcome.
    uint256 public constant APPEAL_BOND = 0.02 ether;

    /// @dev How long a verdict can be challenged before it becomes final. Set at
    ///      deployment rather than fixed, because the right value differs by
    ///      environment: an hour is sensible in production, and a demo cannot
    ///      wait an hour between a verdict and its settlement. Immutable, so it
    ///      still cannot be changed to suit a particular claim.
    uint64 public immutable CHALLENGE_WINDOW;

    /// @dev How long a witness has to produce a finding before it can be replaced.
    ///      Without this a witness that simply does nothing locks the claimant's
    ///      bond forever, costs itself nothing, and is indistinguishable from
    ///      being slow — the cheapest attack in the system.
    uint64 public immutable RESPONSE_WINDOW;

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
    /// @dev Forfeited bonds. Held by the protocol, withdrawable by no one — the
    ///      penalty must not become someone's revenue.
    uint256 public forfeited;

    struct Appeal {
        address appellant;
        uint256 bond;
        address[] panel;
        Verdict original;
        bool open;
    }

    mapping(uint256 => Appeal) private _appeals;
    mapping(uint256 => uint64) public challengeDeadline;

    function appealOf(uint256 claimId) external view returns (Appeal memory) {
        return _appeals[claimId];
    }

    event ClaimSubmitted(uint256 indexed claimId, address indexed claimant, bytes32 subject, uint256 bond);
    event WitnessAssigned(uint256 indexed claimId, address indexed witness);
    event AssignmentFailed(uint256 indexed claimId);
    event VerdictRecorded(uint256 indexed claimId, Verdict verdict, bytes32 evidenceCommitment);
    event Settled(uint256 indexed claimId, address indexed claimant, Verdict verdict);
    event Appealed(uint256 indexed claimId, address indexed appellant, uint256 bond);
    event PanelSeated(uint256 indexed claimId, address[] panel);
    event PanelOverturned(uint256 indexed claimId, Verdict original, Verdict panel, address contradicted, uint256 slashed);
    event PanelUpheld(uint256 indexed claimId, Verdict verdict);
    event AppealAbandoned(uint256 indexed claimId);
    event WitnessTimedOut(uint256 indexed claimId, address indexed witness, uint256 slashed);
    event ClaimantTimedOut(uint256 indexed claimId, address indexed claimant);
    event WitnessPaid(uint256 indexed claimId, address indexed witness, uint256 fee);
    event ClaimantSlashed(uint256 indexed claimId, address indexed claimant, uint256 bond, uint256 stakeSlashed);
    event Withdrawn(address indexed who, uint256 amount);

    error NotRoster();
    error NotSink();
    error NotDeployer();
    error AlreadyWired();
    error NotWired();
    error BondTooSmall();
    error NotRegistered();
    error NotEligible();
    error BadStatus();
    error NothingToWithdraw();
    error TransferFailed();
    error WindowClosed();
    error WindowOpen();
    error NotAParty();
    error AppealBondTooSmall();
    error AlreadyAppealed();
    error PanelSeatedAlready();

    constructor(IWitnessRoster roster_, uint64 challengeWindow_, uint64 responseWindow_) {
        roster = roster_;
        CHALLENGE_WINDOW = challengeWindow_;
        RESPONSE_WINDOW = responseWindow_;
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
    /// @notice Post a claim. msg.value covers the bond plus the witness fee; the
    ///         fee is paid to the witness whatever the verdict turns out to be.
    function submitClaim(bytes32 subject, bytes32 claimHash) external payable returns (uint256 claimId) {
        if (msg.value < MIN_BOND + WITNESS_FEE) revert BondTooSmall();
        // Eligibility, not merely registration: an agent slashed below the stake
        // floor could otherwise keep making claims with no collateral left to
        // slash, which is the position a liar most wants to be in.
        if (!roster.isEligible(msg.sender)) revert NotEligible();

        claimId = nextClaimId++;
        Claim storage c = _claims[claimId];
        c.claimant = msg.sender;
        c.subject = subject;
        c.claimHash = claimHash;
        c.bond = msg.value - WITNESS_FEE;
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
        challengeDeadline[claimId] = uint64(block.timestamp) + CHALLENGE_WINDOW;
        emit VerdictRecorded(claimId, verdict, evidenceCommitment);
        // Deliberately does NOT settle. A verdict nobody can contest is an
        // assertion, not a judgement — settlement waits for the window to close.
    }

    /// @notice Contest a verdict. Open to the claimant or the witness, within the
    ///         window, against a bond. Draws an independent panel.
    function appeal(uint256 claimId) external payable {
        Claim storage c = _claims[claimId];
        if (c.status != Status.Adjudicated) revert BadStatus();
        if (block.timestamp > challengeDeadline[claimId]) revert WindowClosed();
        if (msg.sender != c.claimant && msg.sender != c.witness) revert NotAParty();
        if (msg.value < APPEAL_BOND) revert AppealBondTooSmall();
        if (_appeals[claimId].open) revert AlreadyAppealed();

        _appeals[claimId] =
            Appeal({appellant: msg.sender, bond: msg.value, panel: new address[](0), original: c.verdict, open: true});
        c.status = Status.UnderAppeal;
        emit Appealed(claimId, msg.sender, msg.value);
        roster.requestPanel(claimId, c.claimant, c.witness, msg.sender);
    }

    function onPanelAssigned(uint256 claimId, address[] calldata panel) external onlyRoster {
        _appeals[claimId].panel = panel;
        emit PanelSeated(claimId, panel);
    }

    /// @dev Too few independent reviewers exist. The original verdict stands and
    ///      the appeal bond is returned — the appellant is not penalised for the
    ///      protocol being unable to convene a panel.
    function onPanelUnavailable(uint256 claimId) external onlyRoster {
        Appeal storage a = _appeals[claimId];
        Claim storage c = _claims[claimId];
        withdrawable[a.appellant] += a.bond;
        a.open = false;
        c.status = Status.Adjudicated;
        emit AppealAbandoned(claimId);
        _settle(claimId);
    }

    /// @notice Record the panel's finding. Only the tribunal reaches this.
    function recordPanelVerdict(uint256 claimId, Verdict panelVerdict) external onlySink {
        Claim storage c = _claims[claimId];
        Appeal storage a = _appeals[claimId];
        if (c.status != Status.UnderAppeal) revert BadStatus();
        if (!a.open) revert BadStatus();

        bool appellantVindicated = panelVerdict != a.original;
        a.open = false;
        c.verdict = panelVerdict;
        c.status = Status.Adjudicated;

        if (appellantVindicated) {
            // The panel contradicted the original verdict. The appellant gets its
            // bond back, and whoever the original verdict favoured is slashed for
            // having produced a finding the panel could not reproduce.
            withdrawable[a.appellant] += a.bond;
            address contradicted = a.original == Verdict.Mismatch ? c.witness : c.claimant;
            uint256 slashed = roster.slash(contradicted, APPEAL_BOND);
            emit PanelOverturned(claimId, a.original, panelVerdict, contradicted, slashed);
        } else {
            // The panel upheld it. The appeal bond is forfeited — appealing has to
            // cost something or it becomes a free re-roll on every outcome.
            forfeited += a.bond;
            emit PanelUpheld(claimId, panelVerdict);
        }

        // Deliberately does NOT settle here. A report arrives through a Chainlink
        // Forwarder, which allots limited gas and swallows a revert in the
        // receiver — settling inline (an ENS write plus a slash) exceeded it, and
        // the failure was invisible on-chain. Settlement is a separate,
        // permissionless finalize(), exactly as it already is for a first verdict.
    }

    /// @notice Replace a witness that never produced a finding.
    ///
    /// Permissionless, so a claimant is never dependent on the unresponsive party
    /// choosing to act. The witness is slashed: non-response has to cost
    /// something, or doing nothing becomes the cheapest way to grief someone.
    function timeoutWitness(uint256 claimId) external {
        Claim storage c = _claims[claimId];
        if (c.status != Status.WitnessAssigned) revert BadStatus();
        if (block.timestamp <= c.assignedAt + RESPONSE_WINDOW) revert WindowOpen();

        address unresponsive = c.witness;
        uint256 slashed = roster.slash(unresponsive, WITNESS_FEE);
        emit WitnessTimedOut(claimId, unresponsive, slashed);

        // Draw again rather than abandoning the claim. The claimant asked a
        // legitimate question and should still get an answer.
        c.witness = address(0);
        c.status = Status.Pending;
        roster.requestWitness(claimId, c.claimant);
    }

    /// @notice Abandon a claim whose claimant never supplied its evidence.
    ///
    /// The witness is paid regardless — it was assigned and made itself
    /// available, and the claimant is the party that failed to proceed.
    function timeoutClaimant(uint256 claimId) external {
        Claim storage c = _claims[claimId];
        if (c.status != Status.WitnessAssigned) revert BadStatus();
        if (block.timestamp <= c.assignedAt + RESPONSE_WINDOW * 2) revert WindowOpen();
        c.verdict = Verdict.Unverifiable;
        c.status = Status.Adjudicated;
        emit ClaimantTimedOut(claimId, c.claimant);
        _settle(claimId);
    }

    /// @notice Abandon an appeal whose panel never seated.
    ///
    /// A panel draw can fail without emitting anything — if the VRF callback runs
    /// out of gas the request is marked fulfilled and nothing happens, leaving the
    /// appeal open and the bond locked. Observed on Sepolia. Permissionless, and
    /// the appellant is refunded: it did nothing wrong.
    function timeoutAppeal(uint256 claimId) external {
        Claim storage c = _claims[claimId];
        Appeal storage a = _appeals[claimId];
        if (c.status != Status.UnderAppeal) revert BadStatus();
        if (!a.open) revert BadStatus();
        if (a.panel.length > 0) revert PanelSeatedAlready();
        if (block.timestamp <= challengeDeadline[claimId] + RESPONSE_WINDOW) revert WindowOpen();

        withdrawable[a.appellant] += a.bond;
        a.open = false;
        c.status = Status.Adjudicated;
        emit AppealAbandoned(claimId);
        _settle(claimId);
    }

    /// @notice Settle a verdict once its challenge window has closed unchallenged.
    ///         Permissionless: anyone may call it, so settlement never depends on
    ///         a particular party choosing to act.
    function finalize(uint256 claimId) external {
        Claim storage c = _claims[claimId];
        if (c.status != Status.Adjudicated) revert BadStatus();
        // A claim that has been through an appeal does not wait again — the
        // appeal was the challenge, and escalation is capped at one round.
        bool appealResolved = _appeals[claimId].appellant != address(0) && !_appeals[claimId].open;
        if (!appealResolved && block.timestamp <= challengeDeadline[claimId]) revert WindowOpen();
        _settle(claimId);
    }

    function _settle(uint256 claimId) internal {
        Claim storage c = _claims[claimId];
        c.status = Status.Settled;

        // Reputation follows the verdict that stands, not the first one proposed.
        // Applying it here rather than at recordVerdict is what makes an appeal
        // meaningful: an overturned verdict never reaches the record.
        IStandingWriter(standingWriter).applyVerdict(claimId, c.verdict);

        // The witness is paid the same whatever it reports, so it has no stake in
        // the outcome. This is the fee, not the bond.
        if (c.witness != address(0)) {
            withdrawable[c.witness] += WITNESS_FEE;
            emit WitnessPaid(claimId, c.witness, WITNESS_FEE);
        } else {
            withdrawable[c.claimant] += WITNESS_FEE; // never assigned: refund the fee
        }

        if (c.verdict == Verdict.Mismatch) {
            // The claimant lied. Its bond is forfeited and its stake is slashed —
            // the forfeited bond does NOT go to the witness, or we would be
            // rebuilding the incentive we just removed. It is held by the
            // protocol and withdrawable by nobody.
            forfeited += c.bond;
            uint256 slashed = roster.slash(c.claimant, c.bond);
            emit ClaimantSlashed(claimId, c.claimant, c.bond, slashed);
        } else {
            withdrawable[c.claimant] += c.bond;
        }
        emit Settled(claimId, c.claimant, c.verdict);
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

    /// @dev How far back `pendingForTribunal` will look. A view call still runs
    ///      under the node's eth_call gas cap, so the scan has to be bounded.
    uint256 public constant TRIBUNAL_SCAN_WINDOW = 256;

    /// @notice The oldest claim the tribunal still owes work on, and which kind.
    /// @dev Exists so a deployed CRE workflow can discover its own work instead
    ///      of carrying a claim id in its deploy-time config. A workflow whose
    ///      subject is fixed at deploy time can only ever adjudicate one claim,
    ///      which is fine for a scripted demo and useless for a live submission.
    /// @dev Returns kind 0 for an initial adjudication and kind 1 for an appeal,
    ///      matching VerdictSink.KIND_VERDICT and KIND_PANEL. claimId 0 means
    ///      there is nothing to do.
    /// @dev An appeal is only ready once its panel is seated; before that the
    ///      VRF request is still in flight and there is no one to adjudicate.
    function pendingForTribunal() external view returns (uint256 claimId, uint8 kind) {
        uint256 last = nextClaimId;
        uint256 first = last > TRIBUNAL_SCAN_WINDOW ? last - TRIBUNAL_SCAN_WINDOW : 1;
        for (uint256 i = first; i < last; ++i) {
            Status s = _claims[i].status;
            if (s == Status.WitnessAssigned) return (i, 0);
            if (s == Status.UnderAppeal && _appeals[i].panel.length > 0) return (i, 1);
        }
        return (0, 0);
    }
}

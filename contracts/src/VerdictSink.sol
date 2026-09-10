// SPDX-License-Identifier: MIT
// The single entry point for tribunal verdicts. See docs/design.md §2.3.
pragma solidity 0.8.26;

import {Verdict, IClaimRegistry, IStandingWriter} from "./interfaces/IPerjury.sol";

/// @title VerdictSink — the only door the tribunal can walk through
/// @notice No owner. No setter. No pause. Two immutable authorized senders.
contract VerdictSink {
    address public immutable CRE_REPORT_WRITER;

    /// @dev The second Forwarder this sink accepts.
    ///
    /// Chainlink operates two Forwarders per chain for a given tenant: one that
    /// a workflow deployed to the DON reports through, and one that the CLI
    /// simulator reports through. Both are Chainlink-operated and scoped to the
    /// organisation, so accepting either is not a wider trust assumption than
    /// accepting one — it is the same party arriving by a different door.
    ///
    /// It exists because the address is immutable and the registry's pointer to
    /// this sink locks on first wiring. A sink built for one Forwarder cannot
    /// later accept the other, so choosing one at deployment means betting the
    /// entire demo on that execution path continuing to work. Accepting both
    /// costs a single extra comparison.
    ///
    /// Set it to the same value as CRE_REPORT_WRITER to have exactly one door.
    address public immutable ALT_REPORT_WRITER;

    IClaimRegistry public immutable registry;
    IStandingWriter public immutable standingWriter;

    event ReportAccepted(uint256 indexed claimId, Verdict verdict, bytes32 evidenceCommitment);
    event PanelReportAccepted(uint256 indexed claimId, Verdict verdict);

    error NotTribunal();
    error BadVerdict();
    error BadReportKind();

    constructor(
        address creReportWriter,
        address altReportWriter,
        IClaimRegistry registry_,
        IStandingWriter standingWriter_
    ) {
        CRE_REPORT_WRITER = creReportWriter;
        ALT_REPORT_WRITER = altReportWriter == address(0) ? creReportWriter : altReportWriter;
        registry = registry_;
        standingWriter = standingWriter_;
    }

    /// @notice Receives the minimal report emitted by the CRE confidential workflow.
    /// @dev The report carries a verdict and a commitment — never evidence, never
    ///      methodology. See docs/design.md §3.2 for the enclave boundary.
    /// @dev Report kinds. A Chainlink Forwarder only ever calls `onReport`, so a
    ///      separate entry point for panel verdicts would be unreachable in
    ///      production — the kind has to travel inside the payload.
    uint8 public constant KIND_VERDICT = 0;
    uint8 public constant KIND_PANEL = 1;

    /// @notice The only entry point. Every report the tribunal delivers arrives
    ///         here, and routes on the kind carried in the payload.
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        if (msg.sender != CRE_REPORT_WRITER && msg.sender != ALT_REPORT_WRITER) revert NotTribunal();
        (uint8 kind, uint256 claimId, uint8 verdictRaw, bytes32 evidenceCommitment) =
            abi.decode(report, (uint8, uint256, uint8, bytes32));
        if (verdictRaw == 0 || verdictRaw > uint8(Verdict.Unverifiable)) revert BadVerdict();
        Verdict verdict = Verdict(verdictRaw);

        if (kind == KIND_PANEL) {
            registry.recordPanelVerdict(claimId, verdict);
            emit PanelReportAccepted(claimId, verdict);
        } else if (kind == KIND_VERDICT) {
            registry.recordVerdict(claimId, verdict, evidenceCommitment);
            emit ReportAccepted(claimId, verdict, evidenceCommitment);
        } else {
            revert BadReportKind();
        }
    }

}

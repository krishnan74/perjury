// SPDX-License-Identifier: MIT
// The single entry point for tribunal verdicts. See docs/design.md §2.3.
pragma solidity 0.8.26;

import {Verdict, IClaimRegistry, IStandingWriter} from "./interfaces/IPerjury.sol";

/// @title VerdictSink — the only door the tribunal can walk through
/// @notice No owner. No setter. No pause. One immutable authorized sender.
contract VerdictSink {
    address public immutable CRE_REPORT_WRITER;
    IClaimRegistry public immutable registry;
    IStandingWriter public immutable standingWriter;

    event ReportAccepted(uint256 indexed claimId, Verdict verdict, bytes32 evidenceCommitment);
    event PanelReportAccepted(uint256 indexed claimId, Verdict verdict);

    error NotTribunal();
    error BadVerdict();
    error BadReportKind();

    constructor(address creReportWriter, IClaimRegistry registry_, IStandingWriter standingWriter_) {
        CRE_REPORT_WRITER = creReportWriter;
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
        if (msg.sender != CRE_REPORT_WRITER) revert NotTribunal();
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

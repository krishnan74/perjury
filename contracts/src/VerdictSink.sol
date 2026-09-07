// SPDX-License-Identifier: MIT
// ─────────────────────────────────────────────────────────────
// Perjury — VerdictSink.sol
// Provenance: AI-ASSISTED.
//   Human-specified: exactly one address may deliver a verdict,
//     set at construction and never mutable. Changing the CRE
//     writer is a redeploy, not a setter — "only the tribunal can
//     write" has to survive a hostile read of this file.
//   AI-implemented: report decoding and dispatch.
// See docs/design.md §2.3.
// ─────────────────────────────────────────────────────────────
pragma solidity 0.8.26;

import {Verdict, IClaimRegistry, IStandingWriter} from "./interfaces/IPerjury.sol";

/// @title VerdictSink — the only door the tribunal can walk through
/// @notice No owner. No setter. No pause. One immutable authorized sender.
contract VerdictSink {
    address public immutable CRE_REPORT_WRITER;
    IClaimRegistry public immutable registry;
    IStandingWriter public immutable standingWriter;

    event ReportAccepted(uint256 indexed claimId, Verdict verdict, bytes32 evidenceCommitment);

    error NotTribunal();
    error BadVerdict();

    constructor(address creReportWriter, IClaimRegistry registry_, IStandingWriter standingWriter_) {
        CRE_REPORT_WRITER = creReportWriter;
        registry = registry_;
        standingWriter = standingWriter_;
    }

    /// @notice Receives the minimal report emitted by the CRE confidential workflow.
    /// @dev The report carries a verdict and a commitment — never evidence, never
    ///      methodology. See docs/design.md §3.2 for the enclave boundary.
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        if (msg.sender != CRE_REPORT_WRITER) revert NotTribunal();
        (uint256 claimId, uint8 verdictRaw, bytes32 evidenceCommitment) =
            abi.decode(report, (uint256, uint8, bytes32));
        if (verdictRaw == 0 || verdictRaw > uint8(Verdict.Unverifiable)) revert BadVerdict();
        Verdict verdict = Verdict(verdictRaw);

        registry.recordVerdict(claimId, verdict, evidenceCommitment);
        standingWriter.applyVerdict(claimId, verdict);
        emit ReportAccepted(claimId, verdict, evidenceCommitment);
    }
}

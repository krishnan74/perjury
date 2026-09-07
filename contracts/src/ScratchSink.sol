// SPDX-License-Identifier: MIT
// Throwaway probe: records msg.sender of an incoming CRE report so we can learn
// whether reports arrive from the workflow owner or a Chainlink Forwarder.
// VerdictSink.CRE_REPORT_WRITER is immutable, so this must be measured, not guessed.
pragma solidity 0.8.26;

contract ScratchSink {
    event ReportSeen(address indexed sender, bytes metadata, bytes report);

    address public lastSender;
    bytes public lastReport;
    uint256 public callCount;

    function onReport(bytes calldata metadata, bytes calldata report) external {
        lastSender = msg.sender;
        lastReport = report;
        ++callCount;
        emit ReportSeen(msg.sender, metadata, report);
    }
}

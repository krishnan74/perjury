// SPDX-License-Identifier: MIT
// ─────────────────────────────────────────────────────────────
// Perjury — PerjuryStandingWriter.sol
// Provenance: AI-ASSISTED.
//   Human-specified: this contract holds the ENS Enhanced Access
//     Control role, and must be incapable of anything except
//     writing the two reputation records. It has no function that
//     can setAddr, transfer a name, grant a role, or touch
//     identity data — so even a full compromise of this contract
//     is bounded to one text record per agent.
//   AI-implemented: standing arithmetic, int↔string encoding.
// See docs/design.md §2.4 and §4.2.
// ─────────────────────────────────────────────────────────────
pragma solidity 0.8.26;

import {Verdict, IClaimRegistry, IStandingWriter, IWitnessRoster, ITextResolver, Claim} from
    "./interfaces/IPerjury.sol";

/// @title PerjuryStandingWriter — the narrow ENS write adapter
contract PerjuryStandingWriter is IStandingWriter {
    string public constant STANDING_KEY = "perjury.standing";
    int256 public constant MATCH_DELTA = 1;
    int256 public constant MISMATCH_DELTA = -3;

    ITextResolver public immutable resolver;
    IClaimRegistry public immutable registry;
    IWitnessRoster public immutable roster;

    address public verdictSink;
    bool public wired;
    address private immutable _deployer;

    event StandingUpdated(bytes32 indexed node, int256 oldStanding, int256 newStanding);

    error NotSink();
    error NotDeployer();
    error AlreadyWired();

    constructor(ITextResolver resolver_, IClaimRegistry registry_, IWitnessRoster roster_) {
        resolver = resolver_;
        registry = registry_;
        roster = roster_;
        _deployer = msg.sender;
    }

    function wireSink(address verdictSink_) external {
        if (msg.sender != _deployer) revert NotDeployer();
        if (wired) revert AlreadyWired();
        verdictSink = verdictSink_;
        wired = true;
    }

    /// @notice The ONLY mutating function. Reachable only from VerdictSink,
    ///         which is reachable only from the CRE tribunal address.
    function applyVerdict(uint256 claimId, Verdict verdict) external {
        if (msg.sender != verdictSink) revert NotSink();
        if (verdict == Verdict.Unverifiable || verdict == Verdict.None) return; // standing untouched

        Claim memory c = registry.claimOf(claimId);
        bytes32 node = roster.nodeOf(c.claimant);

        int256 oldStanding = _parse(resolver.text(node, STANDING_KEY));
        int256 newStanding = verdict == Verdict.Match ? oldStanding + MATCH_DELTA : oldStanding + MISMATCH_DELTA;

        resolver.setText(node, STANDING_KEY, _toString(newStanding));
        if (verdict == Verdict.Mismatch) roster.onMismatch(c.claimant);

        emit StandingUpdated(node, oldStanding, newStanding);
    }

    function _parse(string memory s) internal pure returns (int256) {
        bytes memory b = bytes(s);
        if (b.length == 0) return 0;
        bool neg = b[0] == "-";
        int256 v;
        for (uint256 i = neg ? 1 : 0; i < b.length; ++i) {
            uint8 ch = uint8(b[i]);
            if (ch < 48 || ch > 57) return 0; // unparseable ⇒ treat as zero
            v = v * 10 + int256(uint256(ch - 48));
        }
        return neg ? -v : v;
    }

    function _toString(int256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bool neg = v < 0;
        uint256 x = neg ? uint256(-v) : uint256(v);
        bytes memory buf;
        while (x != 0) {
            buf = abi.encodePacked(uint8(48 + (x % 10)), buf);
            x /= 10;
        }
        return neg ? string(abi.encodePacked("-", buf)) : string(buf);
    }
}

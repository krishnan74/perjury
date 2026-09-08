// SPDX-License-Identifier: MIT
// Narrow ENS write adapter for reputation records. See docs/design.md §2.4 and §4.2.
pragma solidity 0.8.26;

import {Verdict, IClaimRegistry, IStandingWriter, IWitnessRoster, ITextResolver, Claim} from
    "./interfaces/IPerjury.sol";

/// @title PerjuryStandingWriter — the narrow ENS write adapter
contract PerjuryStandingWriter is IStandingWriter {
    // Vendor-prefixed per ENS team guidance for app-specific records.
    // Vendor-prefixed per ENS team guidance for app-specific records.
    string public constant STANDING_KEY = "com.perjury.agent-standing";
    int256 public constant MATCH_DELTA = 1;
    int256 public constant MISMATCH_DELTA = -3;

    ITextResolver public immutable resolver;
    IClaimRegistry public immutable registry;
    IWitnessRoster public immutable roster;

    address public verdictSink;
    bool public wired;
    address private immutable _deployer;

    event StandingUpdated(bytes32 indexed node, int256 oldStanding, int256 newStanding);

    error NotRegistry();
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

    /// @notice The ONLY mutating function. Reachable only from ClaimRegistry's
    ///         settlement path, which in turn only runs on a verdict delivered by
    ///         the CRE tribunal and left unchallenged (or upheld on appeal).
    /// @dev The caller is the registry rather than the sink because a verdict is
    ///      no longer final when recorded — reputation must follow the outcome
    ///      that stands, so it is written at settlement, not at adjudication.
    function applyVerdict(uint256 claimId, Verdict verdict) external {
        if (msg.sender != address(registry)) revert NotRegistry();
        if (verdict == Verdict.Unverifiable || verdict == Verdict.None) return; // standing untouched

        Claim memory c = registry.claimOf(claimId);
        bytes32 node = roster.nodeOf(c.claimant);
        bytes memory dnsName = roster.dnsNameOf(c.claimant);

        int256 oldStanding = _readStanding(node, dnsName);
        int256 newStanding = verdict == Verdict.Match ? oldStanding + MATCH_DELTA : oldStanding + MISMATCH_DELTA;

        // ENSv2 setText takes the DNS-encoded name; the EAC resource is derived
        // from the text key alone, so this grant covers this key and nothing else.
        resolver.setText(dnsName, STANDING_KEY, _toString(newStanding));
        if (verdict == Verdict.Mismatch) roster.onMismatch(c.claimant);

        emit StandingUpdated(node, oldStanding, newStanding);
    }

    /// @dev Reads the current standing through ENSIP-10 resolve(). A direct
    ///      text() call reverts on the Permissioned Resolver, and a revert here
    ///      would take the whole verdict down with it.
    function _readStanding(bytes32 node, bytes memory dnsName) internal view returns (int256) {
        bytes memory inner = abi.encodeWithSignature("text(bytes32,string)", node, STANDING_KEY);
        (bool ok, bytes memory ret) =
            address(resolver).staticcall(abi.encodeWithSelector(ITextResolver.resolve.selector, dnsName, inner));
        if (!ok || ret.length == 0) return 0;
        bytes memory encoded = abi.decode(ret, (bytes));
        if (encoded.length == 0) return 0;
        return _parse(abi.decode(encoded, (string)));
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

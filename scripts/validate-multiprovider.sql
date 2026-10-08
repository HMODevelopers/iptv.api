-- Read-only checks after MultiProvider; never prints stream URLs or encrypted data.
SELECT name,slug,type,isActive,syncEnabled FROM providers ORDER BY id;
SELECT name FROM iptv_migrations ORDER BY timestamp;
SELECT COUNT(*) AS channels_total FROM channels;
SELECT COUNT(*) AS publications_total FROM channel_publications;
SELECT COUNT(*) AS collections_items_total FROM channel_collection_items;
SELECT COUNT(*) AS grants_total FROM user_channel_access;
SELECT COUNT(*) AS streams_total FROM streams;
-- All following counts must be zero immediately after backfill.
SELECT COUNT(*) AS missing_iptv_org_links
FROM channels c LEFT JOIN provider_channels pc ON pc.channelId=c.id AND pc.externalId=c.externalId
LEFT JOIN providers p ON p.id=pc.providerId AND p.slug='iptv-org'
WHERE c.source='iptv-org' AND p.id IS NULL;
SELECT COUNT(*) AS streams_without_provenance FROM streams WHERE providerChannelId IS NULL;
SELECT COUNT(*) AS inconsistent_stream_channels FROM streams s JOIN provider_channels pc ON pc.id=s.providerChannelId WHERE s.channelId<>pc.channelId;
SELECT COUNT(*) AS duplicate_sources FROM (
  SELECT providerId,externalId FROM provider_channels GROUP BY providerId,externalId HAVING COUNT(*)>1
) duplicates;
SELECT COUNT(*) AS duplicate_streams_in_source FROM (
  SELECT providerChannelId,identityKey FROM streams GROUP BY providerChannelId,identityKey HAVING COUNT(*)>1
) duplicates;
SHOW INDEX FROM streams;

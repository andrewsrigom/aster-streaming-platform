# Historical one-time migration. Already applied; do not rerun against restricted policy.
# The public synthetic test credential is rendered separately from the URL for the redacting scanner.
$ErrorActionPreference='Stop'
$asterPublishers=@(docker ps --filter label=com.docker.compose.project=aster-p04-development --filter label=com.docker.compose.service=media-publish --format '{{.ID}}')
if ($asterPublishers.Count -ne 0) { throw 'Active publisher; refuse policy migration' }
$asterMigration=@'
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire("/workspace/services/catalog/package.json");
const {GetBucketAclCommand,GetBucketPolicyCommand,ListObjectsV2Command,PutObjectCommand,PutBucketPolicyCommand,DeleteObjectCommand} = require("@aws-sdk/client-s3");
const {createAsterPostgresAdapter} = await import("/workspace/packages/postgres/dist/src/index.js");
const {createAsterObjectStorageAdapter} = await import("/workspace/packages/object-storage-s3/dist/src/index.js");
const {createAsterTelemetry} = await import("/workspace/packages/telemetry/dist/src/index.js");
const media = "/workspace/services/catalog/dist/src/infrastructure/";
const {publicationStorageClient,localPublicationStorage,publicationPolicy,readPublicationPolicy,preparePublicationStorage}=await import(media+"media/publication-storage.js");
const {localMediaStorage}=await import(media+"media/local-storage.js");
const {createPostgresMediaAttester,requirePublicationApproval}=await import(media+"persistence/postgres-attestation.js");
const {readCandidateReport}=await import(media+"media/reuse-candidate.js");
const {createPublicationBundle}=await import(media+"media/publication-bundle.js");
const {grantPublicationAccess}=await import(media+"media/publication-access.js");
const hash="3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d";
const selection={titleId:"00000000-0000-4000-8000-000000080001",expectedVersion:9,hlsAttemptId:"68e41f87-ca12-44ff-96d3-8a9e66d67795",artworkAttemptId:"7674df29-2a04-4055-bcc8-cef60449520f"};
const signal=AbortSignal.timeout(120000);
const telemetry=createAsterTelemetry({serviceName:"publication-policy-migration",serviceVersion:"0.0.0",environment:"local",export:{mode:"none"}});
const databaseUrl=new URL("postgresql://aster_catalog_attester_local@postgres:5432/aster");
databaseUrl.password="aster-test-only";
const database=createAsterPostgresAdapter({connectionString:databaseUrl.toString(),telemetry,maxConnections:1,connectionTimeoutMs:1000,operationTimeoutMs:3000,statementTimeoutMs:2000});
const privateStorage=createAsterObjectStorageAdapter({...localMediaStorage,telemetry,maxInFlightOperations:1,maxObjectBytes:16*1024*1024,operationTimeoutMs:15000});
const published=createAsterObjectStorageAdapter({...localPublicationStorage,telemetry,maxInFlightOperations:1,maxObjectBytes:16*1024*1024,operationTimeoutMs:15000});
const client=publicationStorageClient();
const Bucket=localPublicationStorage.bucket;
const Key="control/publication-access.lock";
const legacy={Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:"*",Action:["s3:GetObject"],Resource:["arn:aws:s3:::aster-media-published/publications/*"]}]};
try {
 const attester=createPostgresMediaAttester(database);
 await attester.probe(signal);
 const registered=await database.transaction(async tx=>({action:"rollback",value:(await tx.query({text:"SELECT title_id, publication_id, bundle_hash FROM catalog.media_attestations LIMIT 2"})).rows}),signal);
 assert.equal(registered.status,"rolled_back");
 assert.deepEqual(registered.value,[{title_id:selection.titleId,publication_id:"c2929850-d3a3-4e30-945f-688d639d2c68",bundle_hash:hash}]);
 const source=await attester.read(selection,signal);
 assert.equal(source.state,"PUBLISHED");
 assert.equal(source.rightsRevision,4);
 const hls=await readCandidateReport(privateStorage,source.hls.candidate.prefix,source.hls.candidate.reportChecksum,signal);
 const art=await readCandidateReport(privateStorage,source.artwork.candidate.prefix,source.artwork.candidate.reportChecksum,signal);
 const bundle=createPublicationBundle(source.identity,hls,art,source.rights,source.metadata);
 assert.equal(bundle.bundleHash,hash);
 const files=[...bundle.hls.files,...bundle.artwork.files,{name:"attribution.json",bytes:bundle.attribution.length}];
 assert.equal(files.length,209);
 const inventory=await client.send(new ListObjectsV2Command({Bucket,Prefix:"publications/",MaxKeys:1000}),{abortSignal:signal});
 assert.equal(inventory.IsTruncated,false);
 assert.deepEqual(inventory.Contents.map(o=>o.Key).sort(),files.map(f=>bundle.prefix+f.name).sort());
 assert.equal(inventory.Contents.reduce((sum,o)=>sum+o.Size,0),95496764);
 const acl=await client.send(new GetBucketAclCommand({Bucket}),{abortSignal:signal});
 assert.ok(acl.Owner.ID && acl.Grants.length>0 && acl.Grants.every(g=>g.Grantee.Type==="CanonicalUser" && g.Grantee.ID===acl.Owner.ID));
 const readLegacy=async()=> {
  const p=await client.send(new GetBucketPolicyCommand({Bucket}),{abortSignal:signal});
  assert.deepEqual(JSON.parse(p.Policy),legacy);
 };
 await readLegacy();
 await client.send(new PutObjectCommand({Bucket,Key,IfNoneMatch:"*",Body:JSON.stringify({owner:"phase06-legacy-restriction",prefix:bundle.prefix,createdAt:new Date().toISOString()}),ContentType:"application/json"}),{abortSignal:signal});
 await grantPublicationAccess(bundle,published,{reveal:async(prefix)=>{
  assert.equal(prefix,bundle.prefix);
  await readLegacy();
  await client.send(new PutBucketPolicyCommand({Bucket,Policy:publicationPolicy([prefix])}),{abortSignal:signal});
  assert.deepEqual(await readPublicationPolicy(client,signal),[prefix]);
 }},async()=>requirePublicationApproval(await attester.read(selection,signal),bundle,Math.floor(Date.now()/1000)),signal);
 await preparePublicationStorage(client,signal);
 await client.send(new DeleteObjectCommand({Bucket,Key}),{abortSignal:signal});
 const after=await attester.read(selection,signal);
 assert.equal(after.state,"PUBLISHED");
 assert.equal(after.rightsRevision,4);
 console.log(JSON.stringify({event:"legacy_publication_policy_restricted",at:new Date().toISOString(),bundleHash:hash,files:files.length,bytes:95496764,sha256Readback:true,currentApproval:true,titleVersion:after.version,rightsRevision:after.rightsRevision,editorialWrites:0,mediaWrites:0,prefixes:await readPublicationPolicy(client,signal),barrierRemoved:true}));
} finally {
 client.destroy();
 await privateStorage.close();
 await published.close();
 await database.close();
 await telemetry.shutdown();
}
'@
docker run --rm --name aster-p06-policy-migration --label com.aster.scope=media-publication --network aster-p04-development_platform --read-only --user 1000:1000 --cpus 1 --memory 384m --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges:true --env NODE_OPTIONS=--max-old-space-size=192 --env ASTER_CATALOG_ATTESTER_DATABASE_PASSWORD=aster-test-only --entrypoint node sha256:68dfa26c24275f046ae8b4ea4acae76bd995a12b36a9cb92fab511c128fe6c24 --input-type=module --eval $asterMigration > evidence/phase-06/policy-migration-verified.jsonl 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Policy migration failed; inspect before retry' }

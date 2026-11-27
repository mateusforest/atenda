import {head,get,BlobNotFoundError} from '@vercel/blob';

export async function readWorkspace(path){
  let metadata;
  try{metadata=await head(path)}catch(error){if(error instanceof BlobNotFoundError)return null;throw error}
  // Capture the write precondition before reading. A concurrent change will make the conditional write fail.
  const doc=await get(path,{access:'private',useCache:false,headers:{'accept-encoding':'identity'}});
  if(!doc)return null;
  if(!metadata.etag)throw Error('O armazenamento não retornou a revisão do painel.');
  return {state:await new Response(doc.stream).json(),rev:metadata.etag};
}

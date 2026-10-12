import {mkdir,rm,cp} from 'node:fs/promises';
const root=new URL('./',import.meta.url),out=new URL('./dist/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of ['index.html','manifest.webmanifest','sw.js','icons','music'])await cp(new URL(name,root),new URL(name,out),{recursive:true});
console.log('Ready: dist/ (Cloudflare Pages Functions remain in functions/)');

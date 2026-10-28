import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {convertPdf} from '../src/pdf-imports.js';
function pdf(pages:number){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${i+3} 0 R`).join(' ')}] /Count ${pages} >>`,...Array.from({length:pages},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>')];
 let text='%PDF-1.4\n';const offsets=[0];for(const [i,o] of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${o}\nendobj\n`;}const start=Buffer.byteLength(text);text+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return text;
}
test('PDF pages convert to ordered PNG images and oversized documents are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'visualy-pdf-'));
 try{const source=join(dir,'source.pdf');await writeFile(source,pdf(2));const pages=await convertPdf(source,dir);assert.equal(pages.length,2);assert.deepEqual((await readFile(join(dir,pages[0]))).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));await writeFile(source,pdf(51));await assert.rejects(convertPdf(source,dir),/1 et 50/);await writeFile(source,'%PDF-invalid');await assert.rejects(convertPdf(source,dir));}finally{await rm(dir,{recursive:true,force:true})}
});

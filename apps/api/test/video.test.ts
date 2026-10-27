import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {transcodeVideo,isVideoContainer} from '../src/video-imports.js';
const exec=promisify(execFile);
test('AVI MPEG4 + PCM becomes H264/AAC fast-start MP4 and video-only inputs work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'screnzly-video-'));
 try{
  const source=join(dir,'source.avi'),output=join(dir,'output.mp4');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x120:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','mpeg4','-c:a','pcm_s16le',source]);
  assert.equal(isVideoContainer((await readFile(source)).subarray(0,16)),true);
  const result=await transcodeVideo(source,output);assert.ok(result.size>0);assert.ok(result.duration>0);
  const {stdout}=await exec('ffprobe',['-v','error','-show_streams','-of','json',output]);
  const streams=JSON.parse(stdout).streams;assert.equal(streams.find((s:any)=>s.codec_type==='video').codec_name,'h264');assert.equal(streams.find((s:any)=>s.codec_type==='audio').codec_name,'aac');
  const bytes=await readFile(output);assert.ok(bytes.indexOf('moov')<bytes.indexOf('mdat'));
  const silent=join(dir,'silent.webm');await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=s=160x120:r=10','-t','1','-c:v','libvpx',silent]);await transcodeVideo(silent,join(dir,'silent.mp4'));
  await writeFile(source,'not a video');assert.equal(isVideoContainer(Buffer.from('not a video')),false);await assert.rejects(transcodeVideo(source,join(dir,'invalid.mp4')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

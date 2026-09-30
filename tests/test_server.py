import sys,unittest,json,base64
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
class Contracts(unittest.TestCase):
 def test_text_extraction(self):
  self.assertEqual(server.extract('a.txt',base64.b64encode('摄影'.encode()).decode()),'摄影')
 def test_unsupported_file(self):
  with self.assertRaises(ValueError):server.extract('a.exe',base64.b64encode(b'anything').decode())
 def test_incomplete_profile(self):
  with self.assertRaises(ValueError):server.validate('parse',{'skills':[]})
 def test_eval_verdict(self):
  with self.assertRaises(ValueError):server.validate('evaluate',{'verdict':'保证成功','reason':'','findings':[],'risks':[],'unknowns':[],'nextSteps':[]})
 def test_six_dimensions(self):
  with self.assertRaises(ValueError):server.validate('analysis',{'overview':'','dimensions':[],'tasks':[]})
 def test_summary_shape(self):
  r={**server.SCHEMAS['summary'],'title':'test'}
  self.assertEqual(server.validate('summary',r)['title'],'test')
 def test_save_key_roundtrip(self):
  import tempfile,shutil
  old_root,old_key=server.ROOT,server.KEY
  d=Path(tempfile.mkdtemp())
  try:
   (d/'.env').write_text('DEEPSEEK_MODEL=deepseek-flash\nPORT=8765\n')
   server.ROOT=d
   server.save_key('sk-'+'a'*32)
   text=(d/'.env').read_text()
   self.assertIn('DEEPSEEK_API_KEY=sk-'+'a'*32,text)
   self.assertIn('DEEPSEEK_MODEL=deepseek-flash',text)
   server.save_key('sk-'+'b'*32)
   text=(d/'.env').read_text()
   self.assertEqual(text.count('DEEPSEEK_API_KEY='),1)
   self.assertIn('sk-'+'b'*32,text)
   self.assertEqual(server.KEY,'sk-'+'b'*32)
  finally:
   server.ROOT=old_root;server.KEY=old_key;shutil.rmtree(d)
 def test_save_key_rejects_bad(self):
  with self.assertRaises(ValueError):server.save_key('short')
if __name__=='__main__':unittest.main()

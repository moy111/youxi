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
if __name__=='__main__':unittest.main()

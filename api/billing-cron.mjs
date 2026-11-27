import billing from './billing.mjs';
export default function scheduledBilling(req,res){
  req.url='/api/billing?action=reconcile';
  return billing(req,res);
}

import nodemailer from 'nodemailer';

export function mailConfigured(env=process.env){
  return /^[a-z0-9._+-]+@atendadot\.com$/i.test(env.ATENDA_SMTP_USER||'')&&!!env.ATENDA_SMTP_PASSWORD;
}

export async function invoiceEmail(email,status,eventId){
  const user=process.env.ATENDA_SMTP_USER;
  const smtp=nodemailer.createTransport({host:'smtp.hostinger.com',port:465,secure:true,
    auth:{user,pass:process.env.ATENDA_SMTP_PASSWORD},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000});
  const paid=['CAPTURED','CONCLUIDA'].includes(status);
  const subject=paid?'Pagamento da mensalidade confirmado':'Confira o pagamento da sua mensalidade';
  const message=paid?'O pagamento da mensalidade foi confirmado.':'O pagamento da mensalidade foi recusado.';
  return smtp.sendMail({from:{name:'Atenda',address:user},to:{address:email,name:''},subject,
    messageId:'<'+eventId+'@atendadot.com>',text:message+' Consulte o histórico em https://atendadot.com/portal#assinatura.'});
}

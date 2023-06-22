import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { LogDocument } from 'moralis/streams';

admin.initializeApp();
const db = getFirestore();

enum JobApplicationStatus {
  InProgress,
  OfferSent,
  OfferAccepted,
  OfferDeclined,
  ApplicationDeclined,
  Hired,
}

export const processDecentralHireEvents = functions.database
  .ref('/moralis/events')
  .onWrite((change) => {
    const message = change.after.val();

    if (!message && !message.processed) {
      functions.logger.log('Retrieved event content: ', message);

      try {
        processEventsByType(message);
      } catch (error) {
        functions.logger.error('Failed to process event: ', error);
        return null;
      }

      return change.after.ref.update({
        ...message,
        processed: true,
      });
    }
    return null;
  });

const processEventsByType = (message: LogDocument) => {
  switch (message.name) {
    case 'JobPostingCreatedEvent':
      processJobPostingCreatedEvent(message);
      break;
    case 'JobPostingClosedEvent':
      processJobPostingClosedEvent(message);
      break;
    case 'JobApplicationCreatedEvent':
      processJobApplicationCreatedEvent(message);
      break;
    case 'JobApplicationOfferSentEvent':
      processJobApplicationOfferSentEvent(message);
      break;
    case 'JobApplicationOfferAcceptedEvent':
      processJobApplicationOfferAcceptedEvent(message);
      break;
    case 'JobApplicationOfferDeclinedEvent':
      processJobApplicationOfferDeclinedEvent(message);
      break;
    case 'JobApplicationApplicationDeclinedEvent':
      processJobApplicationApplicationDeclinedEvent(message);
      break;
    case 'JobApplicationHiredEvent':
      processJobApplicationHiredEvent(message);
      break;
    default:
      break;
  }
};

const processJobPostingCreatedEvent = async (message: LogDocument) => {
  const jobPosting = message;

  const companyProfileAddress = (
    jobPosting._companyProfileAddress || ''
  ).toString();
  const jobTitle = jobPosting._title;
  const country = jobPosting._country;
  const city = jobPosting._city;
  const isRemote = jobPosting._isRemote;
  const contractAddress = (jobPosting._contractAddress || '').toString();

  if (!companyProfileAddress || !contractAddress) {
    functions.logger.log(
      `Failed to process JobPostingCreatedEvent: missing 'companyProfileAddress' or 'contractAddress' (companyProfileAddress: ${companyProfileAddress}, contractAddress: ${contractAddress})`
    );
    return;
  }

  // write to the JobPostings document
  await db.collection('JobPostings').add({
    id: contractAddress,
    companyAddress: companyProfileAddress,
    jobTitle,
    country,
    city,
    isRemote,
    isActive: true,
  });
};

const processJobPostingClosedEvent = async (message: LogDocument) => {
  const jobPosting = message;

  const companyProfileAddress = (
    jobPosting._companyProfileAddress || ''
  ).toString();
  const contractAddress = (jobPosting._contractAddress || '').toString();

  if (!companyProfileAddress || !contractAddress) {
    functions.logger.error(
      `Failed to process JobPostingClosedEvent: missing 'companyProfileAddress' or 'contractAddress' (companyProfileAddress: ${companyProfileAddress}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'companyProfileAddress' or 'contractAddress'`);
  }

  const existingJobPosting = await db
    .collection('JobPostings')
    .doc(contractAddress)
    .get();

  if (!existingJobPosting.exists) {
    functions.logger.error(
      `Failed to process JobPostingClosedEvent: JobPosting not found (contractAddress: ${contractAddress})`
    );
    throw new Error(
      `JobPosting not found (contractAddress: ${contractAddress})`
    );
  }

  // update the JobPostings document
  await db
    .collection('JobPostings')
    .doc(contractAddress)
    .update({
      ...existingJobPosting.data(),
      id: contractAddress,
      companyAddress: companyProfileAddress,
      isActive: false,
    });
};

const processJobApplicationCreatedEvent = async (message: LogDocument) => {
  const jobApplication = message;

  const from = (jobApplication._from || '').toString();
  const contractAddress = (jobApplication._contractAddress || '').toString();

  if (!from || !contractAddress) {
    functions.logger.error(
      `Failed to process JobApplicationCreatedEvent: missing 'from' or 'contractAddress' (from: ${from}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'from' or 'contractAddress'`);
  }

  // write to the JobPostings document
  await db.collection('JobApplications').add({
    id: contractAddress,
    applicantAddress: from,
    status: JobApplicationStatus.InProgress,
  });
};

const jobApplicationStatusChangeEventBase = async (
  message: LogDocument,
  status: JobApplicationStatus
) => {
  const jobApplication = message;

  const from = (jobApplication._from || '').toString();
  const contractAddress = (jobApplication._contractAddress || '').toString();

  if (!from || !contractAddress) {
    functions.logger.error(
      `Failed to process ${jobApplication.name}: missing 'from' or 'contractAddress' (from: ${from}, contractAddress: ${contractAddress})`
    );
    throw new Error(`missing 'from' or 'contractAddress'`);
  }

  const existingJobApplication = await db
    .collection('JobApplications')
    .doc(contractAddress)
    .get();

  if (!existingJobApplication.exists) {
    functions.logger.error(
      `Failed to process ${jobApplication.name}: JobApplication not found (contractAddress: ${contractAddress})`
    );
    throw new Error(
      `JobApplication not found (contractAddress: ${contractAddress})`
    );
  }

  // update the JobApplications document
  await db
    .collection('JobApplications')
    .doc(contractAddress)
    .update({
      ...existingJobApplication.data(),
      id: contractAddress,
      applicantAddress: from,
      status,
    });
};

const processJobApplicationOfferSentEvent = async (message: LogDocument) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferSent
  );
};

const processJobApplicationOfferAcceptedEvent = async (
  message: LogDocument
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferAccepted
  );
};

const processJobApplicationOfferDeclinedEvent = async (
  message: LogDocument
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.OfferDeclined
  );
};

const processJobApplicationApplicationDeclinedEvent = async (
  message: LogDocument
) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.ApplicationDeclined
  );
};

const processJobApplicationHiredEvent = async (message: LogDocument) => {
  return jobApplicationStatusChangeEventBase(
    message,
    JobApplicationStatus.Hired
  );
};

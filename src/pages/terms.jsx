import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'

export default function Terms() {
  return (
    <InfoPage title='Terms of Use' description='Read the Galaxy Movies terms of use.'>
      <InfoParagraph>Galaxy Movies is provided for personal, informational use. Movie descriptions, ratings, release dates, and availability are provided as-is.</InfoParagraph>
      <InfoParagraph>You are responsible for checking the terms, pricing, availability, and age requirements of any third-party service before making a purchase or subscription.</InfoParagraph>
      <InfoParagraph>Do not use the site to scrape, disrupt, or overload the service or its data providers.</InfoParagraph>
      <BackButton />
    </InfoPage>
  )
}
